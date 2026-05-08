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

import java.net.InetAddress;

/**
 * Writes audit log entries asynchronously so the main request
 * is not slowed down by a second DB write.
 *
 * @Async means Spring runs the method in a separate thread pool.
 * @Transactional(propagation = REQUIRES_NEW) ensures the audit log
 * is committed even if the main transaction rolls back (e.g. login failed).
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
            entry.setUser(user);
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
