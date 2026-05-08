package tn.inetum.userservice.controller;

import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tn.inetum.userservice.dto.response.UserResponse;
import tn.inetum.userservice.entities.User;
import tn.inetum.userservice.exceptions.UserNotFoundException;
import tn.inetum.userservice.repository.UserRepository;

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

/**
 * Admin-only endpoints.
 * The SecurityConfig already requires ROLE_ADMIN for /admin/**.
 * The @PreAuthorize here is an extra layer of defence (method-level security).
 */
@RestController
@RequestMapping("/admin")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminController {

    private final UserRepository userRepository;

    /**
     * GET /admin/users?page=0&size=20
     * Returns a paginated list of all users.
     */
    @GetMapping("/users")
    public ResponseEntity<Page<UserResponse>> listUsers(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {

        Page<UserResponse> result = userRepository
                .findAll(PageRequest.of(page, size, Sort.by("createdAt").descending()))
                .map(UserResponse::from);

        return ResponseEntity.ok(result);
    }

    /**
     * GET /admin/users/{id}
     * Returns a single user by UUID.
     */
    @GetMapping("/users/{id}")
    public ResponseEntity<UserResponse> getUser(@PathVariable UUID id) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new UserNotFoundException("User not found: " + id));
        return ResponseEntity.ok(UserResponse.from(user));
    }

    /**
     * POST /admin/users/{id}/deactivate
     * Disables a user account (they can no longer log in).
     */
    @PostMapping("/users/{id}/deactivate")
    public ResponseEntity<Map<String, String>> deactivateUser(@PathVariable UUID id) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new UserNotFoundException("User not found: " + id));
        user.setActive(false);
        userRepository.save(user);
        return ResponseEntity.ok(Map.of("message", "User deactivated"));
    }

    /**
     * POST /admin/users/{id}/activate
     * Re-enables a previously deactivated user account.
     */
    @PostMapping("/users/{id}/activate")
    public ResponseEntity<Map<String, String>> activateUser(@PathVariable UUID id) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new UserNotFoundException("User not found: " + id));
        user.setActive(true);
        user.setFailedLoginCount(0);
        user.setLockedUntil(null);
        userRepository.save(user);
        return ResponseEntity.ok(Map.of("message", "User activated"));
    }

    /**
     * POST /admin/users/{id}/unlock
     * Clears a temporary login lock (e.g. after too many failed attempts).
     */
    @PostMapping("/users/{id}/unlock")
    public ResponseEntity<Map<String, String>> unlockUser(@PathVariable UUID id) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new UserNotFoundException("User not found: " + id));
        user.setLockedUntil(null);
        user.setFailedLoginCount(0);
        userRepository.save(user);
        return ResponseEntity.ok(Map.of("message", "User unlocked"));
    }
}
