package tn.esprit.userservice.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import tn.esprit.userservice.entities.AuditLog;
import tn.esprit.userservice.entities.AuditLogId;

/**
 * Audit logs are write-only in this service.
 * The inherited save() method is all we need for now.
 */
public interface AuditLogRepository extends JpaRepository<AuditLog, AuditLogId> {
}
