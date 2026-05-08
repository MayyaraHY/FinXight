package tn.inetum.userservice.security;

import lombok.RequiredArgsConstructor;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tn.inetum.userservice.entities.User;
import tn.inetum.userservice.repository.UserRepository;

import java.time.OffsetDateTime;
import java.util.List;

/**
 * Bridges Spring Security and our User entity.
 *
 * Spring Security calls loadUserByUsername() when it needs to authenticate
 * a user (e.g. during the login flow when AuthService calls authenticate()).
 * It looks up the user, wraps them in Spring's UserDetails format, and
 * hands back an object that Spring knows how to work with.
 */
@Service
@RequiredArgsConstructor
public class UserDetailsServiceImpl implements UserDetailsService {

    private final UserRepository userRepository;

    @Override
    @Transactional(readOnly = true)
    public UserDetails loadUserByUsername(String email) throws UsernameNotFoundException {
        User user = userRepository.findByEmail(email.toLowerCase())
                .orElseThrow(() -> new UsernameNotFoundException("No user found with email: " + email));

        // Convert our UserRole entities to Spring's GrantedAuthority format.
        // Spring expects authorities in the form "ROLE_ADMIN", "ROLE_VIEWER", etc.
        List<SimpleGrantedAuthority> authorities = user.getRoles().stream()
                .map(ur -> new SimpleGrantedAuthority("ROLE_" + ur.getRole().getName().name()))
                .toList();

        boolean locked = user.getLockedUntil() != null
                && user.getLockedUntil().isAfter(OffsetDateTime.now());

        return org.springframework.security.core.userdetails.User.builder()
                .username(user.getEmail())
                // If the user registered via SSO (no password), use empty string.
                // The password check in AuthService handles this case properly.
                .password(user.getHashedPassword() != null ? user.getHashedPassword() : "")
                .authorities(authorities)
                .accountLocked(locked)
                .disabled(!user.isActive())
                .build();
    }
}
