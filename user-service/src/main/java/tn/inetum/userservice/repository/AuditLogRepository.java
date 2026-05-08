package tn.inetum.userservice.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import tn.inetum.userservice.entities.AuditLog;
import tn.inetum.userservice.entities.AuditLogId;

/**
 * Audit logs are write-only in this service.
 * The inherited save() method is all we need for now.
 */
public interface AuditLogRepository extends JpaRepository<AuditLog, AuditLogId> {
}
