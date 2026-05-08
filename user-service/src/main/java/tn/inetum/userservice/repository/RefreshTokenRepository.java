package tn.inetum.userservice.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import tn.inetum.userservice.entities.RefreshToken;

import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

public interface RefreshTokenRepository extends JpaRepository<RefreshToken, UUID> {

    /** Look up a stored token by its SHA-256 hash (the raw value is never stored). */
    Optional<RefreshToken> findByTokenHash(String tokenHash);

    /**
     * Revoke all active tokens belonging to one user.
     * Used by: logout-everywhere, password reset.
     */
    @Modifying
    @Query("UPDATE RefreshToken r SET r.revokedAt = :now " +
           "WHERE r.user.id = :userId AND r.revokedAt IS NULL")
    int revokeAllByUserId(UUID userId, OffsetDateTime now);

    /**
     * Revoke every token in a token family.
     * Used when token reuse is detected — the whole family is burned as a security measure.
     */
    @Modifying
    @Query("UPDATE RefreshToken r SET r.revokedAt = :now " +
           "WHERE r.familyId = :familyId AND r.revokedAt IS NULL")
    int revokeByFamilyId(UUID familyId, OffsetDateTime now);

    /** Nightly cleanup of tokens whose expiry has passed. */
    @Modifying
    @Query("DELETE FROM RefreshToken r WHERE r.expiresAt < :cutoff")
    int deleteExpiredBefore(OffsetDateTime cutoff);
}
