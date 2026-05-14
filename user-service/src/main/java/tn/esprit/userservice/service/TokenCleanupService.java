package tn.esprit.userservice.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tn.esprit.userservice.repository.EmailVerificationTokenRepository;
import tn.esprit.userservice.repository.PasswordResetTokenRepository;
import tn.esprit.userservice.repository.RefreshTokenRepository;

import java.time.OffsetDateTime;

/**
 * Scheduled job that removes expired tokens from the database.
 *
 * Without this, old rows accumulate forever.  Runs once per day at 02:00 UTC.
 *
 * @Scheduled uses Spring's task executor.  You need @EnableScheduling somewhere
 * (it's on UserServiceApplication).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TokenCleanupService {

    private final RefreshTokenRepository refreshTokenRepository;
    private final PasswordResetTokenRepository passwordResetTokenRepository;
    private final EmailVerificationTokenRepository emailVerificationTokenRepository;

    /** Runs every day at 02:00 UTC. */
    @Scheduled(cron = "0 0 2 * * *")
    @Transactional
    public void cleanupExpiredTokens() {
        OffsetDateTime cutoff = OffsetDateTime.now();

        int refreshDeleted = refreshTokenRepository.deleteExpiredBefore(cutoff);
        int resetDeleted   = passwordResetTokenRepository.deleteExpiredBefore(cutoff);
        int verifyDeleted  = emailVerificationTokenRepository.deleteExpiredBefore(cutoff);

        log.info("Token cleanup: deleted {} refresh tokens, {} reset tokens, {} verify tokens",
                refreshDeleted, resetDeleted, verifyDeleted);
    }
}
