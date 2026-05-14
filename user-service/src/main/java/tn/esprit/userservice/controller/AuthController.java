package tn.esprit.userservice.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirements;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import tn.esprit.userservice.config.CookieProperties;
import tn.esprit.userservice.config.JwtProperties;
import tn.esprit.userservice.dto.request.ForgotPasswordRequest;
import tn.esprit.userservice.dto.request.LoginRequest;
import tn.esprit.userservice.dto.request.RegisterRequest;
import tn.esprit.userservice.dto.request.ResetPasswordRequest;
import tn.esprit.userservice.dto.response.AuthResponse;
import tn.esprit.userservice.service.AuthService;

import java.io.IOException;
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
 *   Secure    → only sent over HTTPS — driven by app.cookie.secure
 *               (false in HTTP dev, true in HTTPS prod)
 *   SameSite  → driven by app.cookie.same-site
 *               (Lax in dev for cross-port localhost, Strict in prod)
 *   Path=/auth → only sent to /auth/* endpoints
 */
@Tag(name = "Authentication", description = "Register, login, logout, token refresh, password reset, and email verification")
@SecurityRequirements  // no security required — these endpoints are public
@RestController
@RequestMapping("/auth")
@RequiredArgsConstructor
public class AuthController {

    private static final String REFRESH_COOKIE = "refresh_token";

    private final AuthService authService;
    private final JwtProperties jwtProperties;
    private final CookieProperties cookieProperties;

    // ----------------------------------------------------------------
    //  POST /auth/register
    // ----------------------------------------------------------------

    @Operation(summary = "Register a new account",
               description = "Creates a user with the VIEWER role and sends a verification email. " +
                             "The account is active immediately but email is unverified until /auth/verify-email is called.")
    @ApiResponses({
        @ApiResponse(responseCode = "201", description = "Account created — verification email sent"),
        @ApiResponse(responseCode = "400", description = "Validation error (invalid email, password too short, etc.)"),
        @ApiResponse(responseCode = "409", description = "Email already registered")
    })
    @PostMapping(value = "/register", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<Map<String, String>> register(
            @RequestPart("data")    @Valid RegisterRequest req,
            @RequestPart(value = "picture", required = false) MultipartFile picture,
            HttpServletRequest httpRequest) throws IOException {

        authService.register(req, picture, extractIp(httpRequest), httpRequest.getHeader("User-Agent"));

        return ResponseEntity.status(HttpStatus.CREATED)
                .body(Map.of("message", "Please check your email to verify your account."));
    }

    // ----------------------------------------------------------------
    //  POST /auth/login
    // ----------------------------------------------------------------

    @Operation(summary = "Log in",
               description = "Verifies credentials and returns a short-lived JWT access token in the body " +
                             "and a long-lived refresh token as an HttpOnly cookie.")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Login successful — access token + user info returned"),
        @ApiResponse(responseCode = "401", description = "Invalid credentials or account locked"),
        @ApiResponse(responseCode = "429", description = "Too many login attempts — rate limited")
    })
    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(
            @Valid @RequestBody LoginRequest req,
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse) {

        AuthService.LoginResult result = authService.login(req, extractIp(httpRequest), httpRequest.getHeader("User-Agent"));

        addRefreshTokenCookie(httpResponse, result.rawRefreshToken());

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

    @Operation(summary = "Refresh the access token",
               description = "Exchanges the HttpOnly refresh token cookie for a new access token. " +
                             "The old cookie is replaced with a new one (token rotation). " +
                             "If the same refresh token is used twice, the entire session family is revoked.")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "New access token issued"),
        @ApiResponse(responseCode = "401", description = "Refresh token missing, expired, revoked, or reused")
    })
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

    @Operation(summary = "Log out (current device)",
               description = "Revokes the current refresh token cookie. " +
                             "The access token remains valid until it expires (max 15 min). " +
                             "Use /users/me/logout-all to revoke all devices.")
    @ApiResponse(responseCode = "200", description = "Logged out — refresh cookie cleared")
    @PostMapping("/logout")
    public ResponseEntity<Map<String, String>> logout(
            @CookieValue(name = REFRESH_COOKIE, required = false) String rawRefreshToken,
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse) {

        authService.logout(rawRefreshToken, extractIp(httpRequest), httpRequest.getHeader("User-Agent"));
        clearRefreshTokenCookie(httpResponse);
        return ResponseEntity.ok(Map.of("message", "Logged out successfully"));
    }

    // ----------------------------------------------------------------
    //  POST /auth/forgot-password
    // ----------------------------------------------------------------

    @Operation(summary = "Request a password-reset link",
               description = "Sends a one-time reset link to the email if an account exists. " +
                             "Always returns 200 regardless — prevents email enumeration.")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Request processed (email sent if account found)"),
        @ApiResponse(responseCode = "429", description = "Too many requests — rate limited")
    })
    @PostMapping("/forgot-password")
    public ResponseEntity<Map<String, String>> forgotPassword(
            @Valid @RequestBody ForgotPasswordRequest req,
            HttpServletRequest httpRequest) {

        authService.forgotPassword(req, extractIp(httpRequest), httpRequest.getHeader("User-Agent"));
        return ResponseEntity.ok(Map.of("message", "If an account with that email exists, a reset link has been sent."));
    }

    // ----------------------------------------------------------------
    //  POST /auth/reset-password
    // ----------------------------------------------------------------

    @Operation(summary = "Reset password using the one-time link token",
               description = "Validates the token from the email link, sets the new password, " +
                             "and revokes all active refresh tokens (forces re-login on all devices).")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Password changed — all sessions revoked"),
        @ApiResponse(responseCode = "401", description = "Token invalid, expired, or already used")
    })
    @PostMapping("/reset-password")
    public ResponseEntity<Map<String, String>> resetPassword(
            @Valid @RequestBody ResetPasswordRequest req,
            HttpServletRequest httpRequest) {

        authService.resetPassword(req, extractIp(httpRequest), httpRequest.getHeader("User-Agent"));
        return ResponseEntity.ok(Map.of("message", "Password reset successfully. Please log in with your new password."));
    }

    // ----------------------------------------------------------------
    //  POST /auth/verify-email?token=...
    // ----------------------------------------------------------------

    @Operation(summary = "Verify email address",
               description = "Marks the account as verified using the token from the verification email link.")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Email verified"),
        @ApiResponse(responseCode = "401", description = "Token invalid, expired, or already used")
    })
    @PostMapping("/verify-email")
    public ResponseEntity<Map<String, String>> verifyEmail(
            @RequestParam String token,
            HttpServletRequest httpRequest) {

        authService.verifyEmail(token, extractIp(httpRequest), httpRequest.getHeader("User-Agent"));
        return ResponseEntity.ok(Map.of("message", "Email verified successfully. You can now log in."));
    }

    // ----------------------------------------------------------------
    //  POST /auth/resend-verification
    // ----------------------------------------------------------------

    @Operation(summary = "Resend the verification email",
               description = "Issues a new verification token and re-sends the email. " +
                             "Always returns 200 regardless of whether the email exists — prevents enumeration. " +
                             "No-op if the account is already verified.")
    @ApiResponse(responseCode = "200", description = "Request processed (email sent if account found and unverified)")
    @PostMapping("/resend-verification")
    public ResponseEntity<Map<String, String>> resendVerification(
            @RequestParam String email,
            HttpServletRequest httpRequest) {

        authService.resendVerificationEmail(email, extractIp(httpRequest), httpRequest.getHeader("User-Agent"));
        return ResponseEntity.ok(Map.of("message", "If your account exists and is not yet verified, a new verification link has been sent."));
    }

    // ----------------------------------------------------------------
    //  Cookie helpers
    // ----------------------------------------------------------------

    private void addRefreshTokenCookie(HttpServletResponse response, String rawToken) {
        Cookie cookie = new Cookie(REFRESH_COOKIE, rawToken);
        cookie.setHttpOnly(true);
        cookie.setSecure(cookieProperties.secure());           // app.cookie.secure
        cookie.setPath("/auth");                               // only sent to /auth/* endpoints
        cookie.setMaxAge((int) jwtProperties.refreshTokenExpiry());
        cookie.setAttribute("SameSite", cookieProperties.sameSite());  // app.cookie.same-site
        response.addCookie(cookie);
    }

    private void clearRefreshTokenCookie(HttpServletResponse response) {
        Cookie cookie = new Cookie(REFRESH_COOKIE, "");
        cookie.setHttpOnly(true);
        cookie.setSecure(cookieProperties.secure());
        cookie.setPath("/auth");
        cookie.setMaxAge(0);
        cookie.setAttribute("SameSite", cookieProperties.sameSite());
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
