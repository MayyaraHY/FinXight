package tn.esprit.userservice.service;

import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tn.esprit.userservice.dto.request.ChangePasswordRequest;
import tn.esprit.userservice.dto.request.UpdateProfileRequest;
import tn.esprit.userservice.dto.response.ActivityResponse;
import tn.esprit.userservice.dto.response.UserResponse;
import tn.esprit.userservice.entities.User;
import tn.esprit.userservice.exceptions.UserNotFoundException;
import tn.esprit.userservice.repository.AuditLogRepository;
import tn.esprit.userservice.repository.UserRepository;

import java.util.List;
import java.util.UUID;

/**
 * Handles operations on the currently logged-in user's own profile.
 * (Admin operations on OTHER users are in AdminService, not here.)
 */
@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository userRepository;
    private final AuditLogRepository auditLogRepository;
    private final PasswordEncoder passwordEncoder;
    private final TokenService tokenService;

    /** Returns the profile of the user with the given id. */
    @Transactional(readOnly = true)
    public UserResponse getProfile(UUID userId) {
        User user = loadUser(userId);
        return UserResponse.from(user);
    }

    /** Updates the full name (the only self-editable field for now). */
    @Transactional
    public UserResponse updateProfile(UUID userId, UpdateProfileRequest req) {
        User user = loadUser(userId);
        user.setFirstName(req.firstName());
        user.setLastName(req.lastName());
        user.setPhone(req.phone());
        user.setAddress(req.address());
        user.setPosition(req.position());
        user.setPictureUrl(req.pictureUrl());
        return UserResponse.from(userRepository.save(user));
    }

    /**
     * Lets a logged-in user change their own password.
     * They must provide their current password to confirm it's really them.
     */
    @Transactional
    public void changePassword(UUID userId, ChangePasswordRequest req) {
        User user = loadUser(userId);

        if (!passwordEncoder.matches(req.currentPassword(), user.getHashedPassword())) {
            throw new IllegalArgumentException("Current password is incorrect");
        }

        user.setHashedPassword(passwordEncoder.encode(req.newPassword()));
        userRepository.save(user);
    }

    /**
     * Revokes every refresh token the user has across all devices.
     * After this call they must log in again everywhere.
     */
    @Transactional
    public void logoutAll(UUID userId) {
        tokenService.revokeAllUserTokens(userId);
    }

    /**
     * Marks onboarding as complete by clearing the first-login flag.
     * Idempotent — calling it when the flag is already false simply returns the
     * current profile without touching the row.
     */
    @Transactional
    public UserResponse completeOnboarding(UUID userId) {
        User user = loadUser(userId);
        if (user.isFirstLogin()) {
            user.setFirstLogin(false);
            user = userRepository.save(user);
        }
        return UserResponse.from(user);
    }

    /** Returns the user's most recent audit-log entries (auth events) for the dashboard feed. */
    @Transactional(readOnly = true)
    public List<ActivityResponse> getRecentActivity(UUID userId, int limit) {
        int capped = Math.min(Math.max(limit, 1), 50);
        return auditLogRepository
                .findByUserIdOrderByCreatedAtDesc(userId, PageRequest.of(0, capped))
                .stream()
                .map(ActivityResponse::from)
                .toList();
    }

    // ----------------------------------------------------------------
    //  Internal helpers
    // ----------------------------------------------------------------

    private User loadUser(UUID userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new UserNotFoundException("User not found: " + userId));
    }
}
