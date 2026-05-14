package tn.esprit.userservice.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import tn.esprit.userservice.entities.PasswordResetToken;

import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

public interface PasswordResetTokenRepository extends JpaRepository<PasswordResetToken, UUID> {

    /** Validate a password-reset link by looking up the token hash. */
    Optional<PasswordResetToken> findByTokenHash(String tokenHash);

    /** Nightly cleanup of expired reset tokens. */
    @Modifying
    @Query("DELETE FROM PasswordResetToken t WHERE t.expiresAt < :cutoff")
    int deleteExpiredBefore(OffsetDateTime cutoff);
}
