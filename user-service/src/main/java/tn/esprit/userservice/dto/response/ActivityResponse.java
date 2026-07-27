package tn.esprit.userservice.dto.response;

import tn.esprit.userservice.entities.AuditLog;

import java.time.OffsetDateTime;

/**
 * A single recent-activity entry for the logged-in user's dashboard.
 * v1 surfaces auth events (login, logout, etc.) drawn from the audit log.
 */
public record ActivityResponse(
        String eventType,
        OffsetDateTime createdAt,
        String ipAddress
) {
    /** Convenience factory — converts an AuditLog entity to this DTO. */
    public static ActivityResponse from(AuditLog log) {
        return new ActivityResponse(
                log.getEventType() != null ? log.getEventType().name() : null,
                log.getCreatedAt(),
                log.getIpAddress() != null ? log.getIpAddress().getHostAddress() : null
        );
    }
}
