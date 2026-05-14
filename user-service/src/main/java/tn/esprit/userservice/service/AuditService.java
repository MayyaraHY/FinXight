package tn.esprit.userservice.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import tn.esprit.userservice.entities.AuditLog;
import tn.esprit.userservice.entities.User;
import tn.esprit.userservice.entities.enums.AuditEventType;
import tn.esprit.userservice.repository.AuditLogRepository;

import java.net.InetAddress;

/**
 * Writes audit log entries asynchronously so the main request thread
 * is not slowed down by a second DB write.
 *
 * WHY user_id is a plain UUID (no FK):
 * The @Async thread opens its own transaction (REQUIRES_NEW) and can fire
 * before the caller's transaction commits. If audit_logs had a real FK to
 * users, Postgres would reject the INSERT for any event that fires while the
 * user row is still uncommitted (e.g. REGISTER). Storing user_id as a plain
 * UUID removes the constraint entirely — audit logs are forensic records and
 * must outlive or precede their associated users.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AuditService {

    private final AuditLogRepository auditLogRepository;

    @Async
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void log(AuditEventType eventType,
                    User user,
                    InetAddress ipAddress,
                    String userAgent,
                    String details) {
        try {
            AuditLog entry = new AuditLog();
            entry.setEventType(eventType);

            // Store the UUID directly — no FK, no re-attachment needed.
            // This is safe even if the user's INSERT hasn't committed yet.
            if (user != null) {
                entry.setUserId(user.getId());
            }

            entry.setIpAddress(ipAddress);
            entry.setUserAgent(userAgent);
            entry.setDetails(details);
            auditLogRepository.save(entry);
        } catch (Exception ex) {
            // Audit failures must never break the main request
            log.error("Failed to write audit log for event {}: {}", eventType, ex.getMessage(), ex);
        }
    }

    /** Convenience overload when no user context is available (e.g. failed login on unknown email). */
    @Async
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void log(AuditEventType eventType, InetAddress ipAddress, String userAgent, String details) {
        log(eventType, null, ipAddress, userAgent, details);
    }
}
