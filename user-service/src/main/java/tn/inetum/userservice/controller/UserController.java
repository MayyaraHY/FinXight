package tn.inetum.userservice.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
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
 * All routes require a valid JWT (enforced by SecurityConfig).
 *
 * The user's UUID is extracted from the JWT "uid" claim — never from the request body.
 * This means users can only ever act on their own account.
 */
@Tag(name = "User Profile", description = "View and manage the logged-in user's own account")
@SecurityRequirement(name = "bearerAuth")
@RestController
@RequestMapping("/users")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;

    // ----------------------------------------------------------------

    @Operation(summary = "Get my profile",
               description = "Returns the profile of the currently authenticated user.")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Profile returned"),
        @ApiResponse(responseCode = "401", description = "Not authenticated")
    })
    @GetMapping("/me")
    public ResponseEntity<UserResponse> getProfile(@AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(userService.getProfile(extractUserId(jwt)));
    }

    // ----------------------------------------------------------------

    @Operation(summary = "Update my profile",
               description = "Updates the full name of the currently authenticated user.")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Profile updated"),
        @ApiResponse(responseCode = "400", description = "Validation error"),
        @ApiResponse(responseCode = "401", description = "Not authenticated")
    })
    @PutMapping("/me")
    public ResponseEntity<UserResponse> updateProfile(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody UpdateProfileRequest req) {
        return ResponseEntity.ok(userService.updateProfile(extractUserId(jwt), req));
    }

    // ----------------------------------------------------------------

    @Operation(summary = "Change my password",
               description = "Changes the password. Requires the current password for confirmation.")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Password changed"),
        @ApiResponse(responseCode = "400", description = "Current password is incorrect"),
        @ApiResponse(responseCode = "401", description = "Not authenticated")
    })
    @PostMapping("/me/change-password")
    public ResponseEntity<Map<String, String>> changePassword(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody ChangePasswordRequest req) {
        userService.changePassword(extractUserId(jwt), req);
        return ResponseEntity.ok(Map.of("message", "Password changed successfully"));
    }

    // ----------------------------------------------------------------

    @Operation(summary = "Log out everywhere",
               description = "Revokes all refresh tokens for this account across all devices. " +
                             "Each device will need to log in again when its current access token expires.")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "All sessions revoked"),
        @ApiResponse(responseCode = "401", description = "Not authenticated")
    })
    @PostMapping("/me/logout-all")
    public ResponseEntity<Map<String, String>> logoutAll(@AuthenticationPrincipal Jwt jwt) {
        userService.logoutAll(extractUserId(jwt));
        return ResponseEntity.ok(Map.of("message", "All sessions have been revoked. Please log in again."));
    }

    // ----------------------------------------------------------------
    //  Helper
    // ----------------------------------------------------------------

    private UUID extractUserId(Jwt jwt) {
        return UUID.fromString(jwt.getClaimAsString("uid"));
    }
}
