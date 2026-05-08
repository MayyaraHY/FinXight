package tn.inetum.userservice.dto.response;

import tn.inetum.userservice.entities.User;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Public representation of a user.
 * Never contains the hashed password or internal fields.
 */
public record UserResponse(
        UUID id,
        String email,
        String fullName,
        boolean active,
        boolean verified,
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
                user.getEmail(),
                user.getFullName(),
                user.isActive(),
                user.isVerified(),
                roleNames,
                user.getCreatedAt()
        );
    }
}
