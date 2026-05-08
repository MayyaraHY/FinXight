package tn.inetum.userservice.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import tn.inetum.userservice.entities.Role;
import tn.inetum.userservice.entities.enums.RoleName;

import java.util.Optional;

public interface RoleRepository extends JpaRepository<Role, Integer> {

    /** Used at registration to look up the default VIEWER role to assign. */
    Optional<Role> findByName(RoleName name);
}
