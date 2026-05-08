package tn.inetum.userservice.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tn.inetum.userservice.dto.request.ChangePasswordRequest;
import tn.inetum.userservice.dto.request.UpdateProfileRequest;
import tn.inetum.userservice.dto.response.UserResponse;
import tn.inetum.userservice.service.UserService;

import java.util.Map;
import java.util.UUID;

/**
 * Endpoints for the currently logged-in user to manage their own account.
 * All routes here require a valid JWT (enforced by SecurityConfig).
 *
 * We extract the user's UUID from the JWT "uid" claim injected by @AuthenticationPrincipal.
 * This means we NEVER trust a user-supplied ID in the request body — they can only act on themselves.
 */
@RestController
@RequestMapping("/users")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;

    /** GET /users/me — returns the profile of the logged-in user. */
    @GetMapping("/me")
    public ResponseEntity<UserResponse> getProfile(@AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(userService.getProfile(extractUserId(jwt)));
    }

    /** PUT /users/me — updates the logged-in user's full name. */
    @PutMapping("/me")
    public ResponseEntity<UserResponse> updateProfile(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody UpdateProfileRequest req) {
        return ResponseEntity.ok(userService.updateProfile(extractUserId(jwt), req));
    }

    /** POST /users/me/change-password — changes the logged-in user's password. */
    @PostMapping("/me/change-password")
    public ResponseEntity<Map<String, String>> changePassword(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody ChangePasswordRequest req) {
        userService.changePassword(extractUserId(jwt), req);
        return ResponseEntity.ok(Map.of("message", "Password changed successfully"));
    }

    // ----------------------------------------------------------------
    //  Helper
    // ----------------------------------------------------------------

    /**
     * The JWT contains a "uid" claim set during minting in TokenService.
     * We read it here to know which user is making the request.
     */
    private UUID extractUserId(Jwt jwt) {
        return UUID.fromString(jwt.getClaimAsString("uid"));
    }
}
