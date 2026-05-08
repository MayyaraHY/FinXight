package tn.inetum.userservice.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import tn.inetum.userservice.entities.UserRole;
import tn.inetum.userservice.entities.UserRoleId;

/**
 * Used to persist new role assignments (e.g. when a user registers and gets the VIEWER role).
 * Querying roles is done through the User.roles @OneToMany collection, not here.
 */
public interface UserRoleRepository extends JpaRepository<UserRole, UserRoleId> {
}
