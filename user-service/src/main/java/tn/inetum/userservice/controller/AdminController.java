package tn.inetum.userservice.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tn.inetum.userservice.dto.request.GrantRoleRequest;
import tn.inetum.userservice.dto.response.UserResponse;
import tn.inetum.userservice.entities.Role;
import tn.inetum.userservice.entities.User;
import tn.inetum.userservice.entities.UserRole;
import tn.inetum.userservice.entities.UserRoleId;
import tn.inetum.userservice.exceptions.UserNotFoundException;
import tn.inetum.userservice.repository.RoleRepository;
import tn.inetum.userservice.repository.UserRepository;
import tn.inetum.userservice.repository.UserRoleRepository;

import java.util.Map;
import java.util.UUID;

/**
 * Admin-only endpoints.
 * The SecurityConfig already requires ROLE_ADMIN for /admin/**.
 * The @PreAuthorize here is a second layer of method-level defence.
 */
@Tag(name = "Admin", description = "User management operations — require ADMIN role")
@SecurityRequirement(name = "bearerAuth")
@RestController
@RequestMapping("/admin")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminController {

    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final UserRoleRepository userRoleRepository;

    // ----------------------------------------------------------------
    //  List / Get users
    // ----------------------------------------------------------------

    @Operation(summary = "List all users (paginated)",
               description = "Returns users ordered by creation date descending. Use ?page=0&size=20.")
    @ApiResponse(responseCode = "200", description = "Page of users returned")
    @GetMapping("/users")
    public ResponseEntity<Page<UserResponse>> listUsers(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {

        Page<UserResponse> result = userRepository
                .findAll(PageRequest.of(page, size, Sort.by("createdAt").descending()))
                .map(UserResponse::from);
        return ResponseEntity.ok(result);
    }

    @Operation(summary = "Get a single user by UUID")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "User found"),
        @ApiResponse(responseCode = "404", description = "User not found")
    })
    @GetMapping("/users/{id}")
    public ResponseEntity<UserResponse> getUser(@PathVariable UUID id) {
        User user = loadUser(id);
        return ResponseEntity.ok(UserResponse.from(user));
    }

    // ----------------------------------------------------------------
    //  Activate / Deactivate / Unlock
    // ----------------------------------------------------------------

    @Operation(summary = "Deactivate a user account",
               description = "The user can no longer log in. Existing sessions still work until token expiry.")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "User deactivated"),
        @ApiResponse(responseCode = "404", description = "User not found")
    })
    @PostMapping("/users/{id}/deactivate")
    public ResponseEntity<Map<String, String>> deactivateUser(@PathVariable UUID id) {
        User user = loadUser(id);
        user.setActive(false);
        userRepository.save(user);
        return ResponseEntity.ok(Map.of("message", "User deactivated"));
    }

    @Operation(summary = "Activate a user account",
               description = "Re-enables a deactivated account and clears any login lock.")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "User activated"),
        @ApiResponse(responseCode = "404", description = "User not found")
    })
    @PostMapping("/users/{id}/activate")
    public ResponseEntity<Map<String, String>> activateUser(@PathVariable UUID id) {
        User user = loadUser(id);
        user.setActive(true);
        user.setFailedLoginCount(0);
        user.setLockedUntil(null);
        userRepository.save(user);
        return ResponseEntity.ok(Map.of("message", "User activated"));
    }

    @Operation(summary = "Unlock a user account",
               description = "Clears the temporary login lock caused by too many failed attempts.")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "User unlocked"),
        @ApiResponse(responseCode = "404", description = "User not found")
    })
    @PostMapping("/users/{id}/unlock")
    public ResponseEntity<Map<String, String>> unlockUser(@PathVariable UUID id) {
        User user = loadUser(id);
        user.setLockedUntil(null);
        user.setFailedLoginCount(0);
        userRepository.save(user);
        return ResponseEntity.ok(Map.of("message", "User unlocked"));
    }

    // ----------------------------------------------------------------
    //  Role management
    // ----------------------------------------------------------------

    /**
     * POST /admin/users/{id}/roles/grant
     * Body: { "role": "ACCOUNTANT" }
     *
     * Grants a role to the user. Idempotent — if the user already has it, returns 200 without error.
     */
    @Operation(summary = "Grant a role to a user",
               description = "Assigns ADMIN, ACCOUNTANT, or VIEWER to the user. " +
                             "Idempotent — safe to call even if the role is already assigned.")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Role granted (or already held)"),
        @ApiResponse(responseCode = "400", description = "Invalid role name"),
        @ApiResponse(responseCode = "404", description = "User not found")
    })
    @Transactional
    @PostMapping("/users/{id}/roles/grant")
    public ResponseEntity<UserResponse> grantRole(
            @PathVariable UUID id,
            @Valid @RequestBody GrantRoleRequest req) {

        User user = loadUser(id);

        Role role = roleRepository.findByName(req.role())
                .orElseThrow(() -> new IllegalArgumentException("Unknown role: " + req.role()));

        // Idempotent — skip if already granted
        if (!userRoleRepository.existsByIdUserIdAndIdRoleId(id, role.getId())) {
            UserRole userRole = new UserRole();
            userRole.setId(new UserRoleId(id, role.getId()));
            userRole.setUser(user);
            userRole.setRole(role);
            userRoleRepository.save(userRole);
        }

        // Reload so the response reflects the current roles
        User fresh = loadUser(id);
        return ResponseEntity.ok(UserResponse.from(fresh));
    }

    /**
     * POST /admin/users/{id}/roles/revoke
     * Body: { "role": "ACCOUNTANT" }
     *
     * Removes a role from the user. Idempotent — if the user doesn't have it, returns 200.
     */
    @Operation(summary = "Revoke a role from a user",
               description = "Removes ADMIN, ACCOUNTANT, or VIEWER from the user. " +
                             "Idempotent — safe to call even if the user doesn't have the role.")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Role revoked (or was not held)"),
        @ApiResponse(responseCode = "400", description = "Invalid role name"),
        @ApiResponse(responseCode = "404", description = "User not found")
    })
    @Transactional
    @PostMapping("/users/{id}/roles/revoke")
    public ResponseEntity<UserResponse> revokeRole(
            @PathVariable UUID id,
            @Valid @RequestBody GrantRoleRequest req) {

        User user = loadUser(id);  // validates the user exists

        Role role = roleRepository.findByName(req.role())
                .orElseThrow(() -> new IllegalArgumentException("Unknown role: " + req.role()));

        userRoleRepository.deleteByUserIdAndRoleId(id, role.getId());

        User fresh = loadUser(id);
        return ResponseEntity.ok(UserResponse.from(fresh));
    }

    // ----------------------------------------------------------------
    //  Internal helper
    // ----------------------------------------------------------------

    private User loadUser(UUID id) {
        return userRepository.findById(id)
                .orElseThrow(() -> new UserNotFoundException("User not found: " + id));
    }
}
