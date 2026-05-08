package tn.inetum.userservice.service;

import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tn.inetum.userservice.dto.request.ChangePasswordRequest;
import tn.inetum.userservice.dto.request.UpdateProfileRequest;
import tn.inetum.userservice.dto.response.UserResponse;
import tn.inetum.userservice.entities.User;
import tn.inetum.userservice.exceptions.UserNotFoundException;
import tn.inetum.userservice.repository.UserRepository;

import java.util.UUID;

/**
 * Handles operations on the currently logged-in user's own profile.
 * (Admin operations on OTHER users are in AdminService, not here.)
 */
@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

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
        user.setFullName(req.fullName());
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

    // ----------------------------------------------------------------
    //  Internal helpers
    // ----------------------------------------------------------------

    private User loadUser(UUID userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new UserNotFoundException("User not found: " + userId));
    }
}
