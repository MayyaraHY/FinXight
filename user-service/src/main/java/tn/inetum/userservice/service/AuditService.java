package tn.inetum.userservice.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import tn.inetum.userservice.entities.AuditLog;
import tn.inetum.userservice.entities.User;
import tn.inetum.userservice.entities.enums.AuditEventType;
import tn.inetum.userservice.repository.AuditLogRepository;
import tn.inetum.userservice.repository.UserRepository;

import java.net.InetAddress;

/**
 * Writes audit log entries asynchronously so the main request
 * is not slowed down by a second DB write.
 *
 * @Async means Spring runs the method in a separate thread pool.
 * @Transactional(propagation = REQUIRES_NEW) opens a brand-new Hibernate session
 * in the async thread — completely separate from the caller's session.
 *
 * WHY getReferenceById:
 * The User entity passed by the caller is "detached" in this new session
 * (its original session already committed and closed). If we set that detached
 * object directly on AuditLog, Hibernate sees it as transient and throws
 * TransientPropertyValueException on flush.
 * getReferenceById returns a managed proxy within THIS session using only the
 * user's ID — no extra SELECT is fired, and Hibernate is happy to write the FK.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AuditService {

    private final AuditLogRepository auditLogRepository;
    private final UserRepository userRepository;

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

            // Re-attach the user to THIS session so Hibernate can write the FK.
            // getReferenceById creates a managed proxy without hitting the DB.
            if (user != null && user.getId() != null) {
                entry.setUser(userRepository.getReferenceById(user.getId()));
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
