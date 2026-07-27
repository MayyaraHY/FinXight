package tn.esprit.userservice.dto.response;

import tn.esprit.userservice.entities.User;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Public representation of a user.
 * Never contains the hashed password or internal fields.
 */
public record UserResponse(
        UUID id,
        String firstName,
        String lastName,
        String email,
        String phone,
        String address,
        String position,
        String pictureUrl,
        boolean active,
        boolean verified,
        boolean firstLogin,
        List<String> roles,
        OffsetDateTime createdAt
) {
    /** Convenience factory — converts a User entity to this DTO. */
    public static UserResponse from(User user) {
        List<String> roleNames = user.getRoles().stream()
                .map(ur -> ur.getRole().getName().name())
                .toList();

        return new UserResponse(
                user.getId(),
                user.getFirstName(),
                user.getLastName(),
                user.getEmail(),
                user.getPhone(),
                user.getAddress(),
                user.getPosition(),
                user.getPictureUrl(),
                user.isActive(),
                user.isVerified(),
                user.isFirstLogin(),
                roleNames,
                user.getCreatedAt()
        );
    }
}
