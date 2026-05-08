package tn.inetum.userservice.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import tn.inetum.userservice.entities.User;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface UserRepository extends JpaRepository<User, UUID> {

    /** Used at login to load the user by their email. */
    Optional<User> findByEmail(String email);

    /** Used at registration to reject duplicate emails. */
    boolean existsByEmail(String email);
}
