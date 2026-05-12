package tn.inetum.userservice.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import tn.inetum.userservice.entities.UserRole;
import tn.inetum.userservice.entities.UserRoleId;

import java.util.UUID;

/**
 * Used to persist and remove role assignments.
 * Querying roles for display is done through the User.roles @OneToMany collection, not here.
 */
public interface UserRoleRepository extends JpaRepository<UserRole, UserRoleId> {

    /**
     * Removes a specific role from a user.
     * Used by the admin revoke endpoint.
     */
    @Modifying
    @Query("DELETE FROM UserRole ur WHERE ur.id.userId = :userId AND ur.id.roleId = :roleId")
    void deleteByUserIdAndRoleId(UUID userId, Integer roleId);

    /**
     * Checks whether a user already has a given role (avoids duplicate grant).
     */
    boolean existsByIdUserIdAndIdRoleId(UUID userId, Integer roleId);
}
