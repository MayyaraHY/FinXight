package tn.inetum.userservice.controller;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tn.inetum.userservice.config.JwtProperties;
import tn.inetum.userservice.dto.request.ForgotPasswordRequest;
import tn.inetum.userservice.dto.request.LoginRequest;
import tn.inetum.userservice.dto.request.RegisterRequest;
import tn.inetum.userservice.dto.request.ResetPasswordRequest;
import tn.inetum.userservice.dto.response.AuthResponse;
import tn.inetum.userservice.service.AuthService;

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.Map;

/**
 * Authentication endpoints — all public (no JWT required).
 *
 * REFRESH TOKEN COOKIE STRATEGY
 * ==============================
 * The refresh token is never returned in the response body.
 * Instead, the controller writes it as an HttpOnly cookie named "refresh_token".
 *
 *   HttpOnly  → JavaScript cannot read it → XSS attacks cannot steal it
 *   Secure    → only sent over HTTPS (set to true in production)
 *   SameSite=Strict → browser only sends it to this origin → CSRF protection
 *   Path=/auth → only sent to /auth/* endpoints, not to your API endpoints
 *
 * The frontend never sees or handles the refresh token directly.
 * On expiry of the access token, it POSTs to /auth/refresh — the browser
 * automatically attaches the cookie — and gets a new access token back.
 */
@RestController
@RequestMapping("/auth")
@RequiredArgsConstructor
public class AuthController {

    private static final String REFRESH_COOKIE = "refresh_token";

    private final AuthService authService;
    private final JwtProperties jwtProperties;

    // ----------------------------------------------------------------
    //  POST /auth/register
    // ----------------------------------------------------------------

    @PostMapping("/register")
    public ResponseEntity<Map<String, String>> register(
            @Valid @RequestBody RegisterRequest req,
            HttpServletRequest httpRequest) {

        authService.register(req, extractIp(httpRequest), httpRequest.getHeader("User-Agent"));
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(Map.of("message", "Registration successful. Please check your email to verify your account."));
    }

    // ----------------------------------------------------------------
    //  POST /auth/login
    // ----------------------------------------------------------------

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(
            @Valid @RequestBody LoginRequest req,
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse) {

        AuthService.LoginResult result = authService.login(req, extractIp(httpRequest), httpRequest.getHeader("User-Agent"));

        // Write refresh token as HttpOnly cookie
        addRefreshTokenCookie(httpResponse, result.rawRefreshToken());

        // Return access token + user info in body
        // (UserResponse was pre-built inside the service transaction to avoid lazy-loading issues)
        AuthResponse body = AuthResponse.of(
                result.accessToken(),
                jwtProperties.accessTokenExpiry(),
                result.userResponse()
        );
        return ResponseEntity.ok(body);
    }

    // ----------------------------------------------------------------
    //  POST /auth/refresh
    // ----------------------------------------------------------------

    @PostMapping("/refresh")
    public ResponseEntity<AuthResponse> refresh(
            @CookieValue(name = REFRESH_COOKIE, required = false) String rawRefreshToken,
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse) {

        if (rawRefreshToken == null || rawRefreshToken.isBlank()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        AuthService.LoginResult result = authService.refreshTokens(
                rawRefreshToken, extractIp(httpRequest), httpRequest.getHeader("User-Agent"));

        // Replace the old cookie with the new one
        addRefreshTokenCookie(httpResponse, result.rawRefreshToken());

        AuthResponse body = AuthResponse.of(
                result.accessToken(),
                jwtProperties.accessTokenExpiry(),
                result.userResponse()
        );
        return ResponseEntity.ok(body);
    }

    // ----------------------------------------------------------------
    //  POST /auth/logout
    // ----------------------------------------------------------------

    @PostMapping("/logout")
    public ResponseEntity<Map<String, String>> logout(
            @CookieValue(name = REFRESH_COOKIE, required = false) String rawRefreshToken,
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse) {

        authService.logout(rawRefreshToken, extractIp(httpRequest), httpRequest.getHeader("User-Agent"));

        // Delete the cookie by setting Max-Age=0
        clearRefreshTokenCookie(httpResponse);

        return ResponseEntity.ok(Map.of("message", "Logged out successfully"));
    }

    // ----------------------------------------------------------------
    //  POST /auth/forgot-password
    // ----------------------------------------------------------------

    @PostMapping("/forgot-password")
    public ResponseEntity<Map<String, String>> forgotPassword(
            @Valid @RequestBody ForgotPasswordRequest req,
            HttpServletRequest httpRequest) {

        authService.forgotPassword(req, extractIp(httpRequest), httpRequest.getHeader("User-Agent"));
        // Always return the same message — don't reveal whether the email exists
        return ResponseEntity.ok(Map.of("message", "If an account with that email exists, a reset link has been sent."));
    }

    // ----------------------------------------------------------------
    //  POST /auth/reset-password
    // ----------------------------------------------------------------

    @PostMapping("/reset-password")
    public ResponseEntity<Map<String, String>> resetPassword(
            @Valid @RequestBody ResetPasswordRequest req,
            HttpServletRequest httpRequest) {

        authService.resetPassword(req, extractIp(httpRequest), httpRequest.getHeader("User-Agent"));
        return ResponseEntity.ok(Map.of("message", "Password reset successfully. Please log in with your new password."));
    }

    // ----------------------------------------------------------------
    //  GET /auth/verify-email?token=...
    // ----------------------------------------------------------------

    @PostMapping("/verify-email")
    public ResponseEntity<Map<String, String>> verifyEmail(
            @RequestParam String token,
            HttpServletRequest httpRequest) {

        authService.verifyEmail(token, extractIp(httpRequest), httpRequest.getHeader("User-Agent"));
        return ResponseEntity.ok(Map.of("message", "Email verified successfully. You can now log in."));
    }

    // ----------------------------------------------------------------
    //  Cookie helpers
    // ----------------------------------------------------------------

    private void addRefreshTokenCookie(HttpServletResponse response, String rawToken) {
        Cookie cookie = new Cookie(REFRESH_COOKIE, rawToken);
        cookie.setHttpOnly(true);
        cookie.setSecure(true);       // ← set to false in local dev if not using HTTPS
        cookie.setPath("/auth");      // only sent to /auth/* endpoints
        cookie.setMaxAge((int) jwtProperties.refreshTokenExpiry());
        cookie.setAttribute("SameSite", "Strict");
        response.addCookie(cookie);
    }

    private void clearRefreshTokenCookie(HttpServletResponse response) {
        Cookie cookie = new Cookie(REFRESH_COOKIE, "");
        cookie.setHttpOnly(true);
        cookie.setSecure(true);
        cookie.setPath("/auth");
        cookie.setMaxAge(0);   // Max-Age=0 tells the browser to delete it immediately
        response.addCookie(cookie);
    }

    private InetAddress extractIp(HttpServletRequest request) {
        String xff = request.getHeader("X-Forwarded-For");
        String rawIp = (xff != null && !xff.isBlank())
                ? xff.split(",")[0].trim()
                : request.getRemoteAddr();
        try {
            return InetAddress.getByName(rawIp);
        } catch (UnknownHostException e) {
            return InetAddress.getLoopbackAddress();
        }
    }
}
