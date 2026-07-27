package tn.esprit.userservice.repository;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import tn.esprit.userservice.entities.AuditLog;
import tn.esprit.userservice.entities.AuditLogId;

import java.util.List;
import java.util.UUID;

/**
 * Audit logs are mostly write-only, but the dashboard reads a user's most
 * recent entries to render a recent-activity feed.
 */
public interface AuditLogRepository extends JpaRepository<AuditLog, AuditLogId> {

    /** Most recent audit entries for a user, newest first. Pass a Pageable to cap the count. */
    List<AuditLog> findByUserIdOrderByCreatedAtDesc(UUID userId, Pageable pageable);
}
