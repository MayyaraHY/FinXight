package tn.inetum.userservice.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import tn.inetum.userservice.entities.EmailVerificationToken;

import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

public interface EmailVerificationTokenRepository extends JpaRepository<EmailVerificationToken, UUID> {

    /** Validate an email-verification link by looking up the token hash. */
    Optional<EmailVerificationToken> findByTokenHash(String tokenHash);

    /** Nightly cleanup of expired tokens. */
    @Modifying
    @Query("DELETE FROM EmailVerificationToken t WHERE t.expiresAt < :cutoff")
    int deleteExpiredBefore(OffsetDateTime cutoff);
}
