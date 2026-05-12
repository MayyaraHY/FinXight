package tn.inetum.userservice.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.authentication.JwtGrantedAuthoritiesConverter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfigurationSource;

/**
 * Security filter chain.
 *
 * <ul>
 *   <li>Stateless — no HTTP session; the access JWT carries identity on every request.</li>
 *   <li>CSRF disabled — no server-rendered forms; the only state-changing endpoint that
 *       uses a cookie is {@code /auth/refresh}, and that cookie is {@code SameSite}
 *       (configurable via {@code app.cookie.same-site}).</li>
 *   <li>CORS wired in via {@link CorsConfigurationSource} so cross-origin browser calls
 *       (frontend → this service) pass preflight.</li>
 *   <li>Public endpoints: {@code /auth/**}, {@code /.well-known/**}, Swagger.</li>
 *   <li>Everything else requires a valid bearer JWT verified by {@link JwtDecoder}.</li>
 *   <li>Roles claim {@code "roles"} in the JWT becomes Spring authorities {@code ROLE_*}.</li>
 * </ul>
 */
@Configuration
@EnableMethodSecurity
public class SecurityConfig {

    @Bean
    SecurityFilterChain securityFilterChain(
            HttpSecurity http,
            CorsConfigurationSource corsConfigurationSource
    ) throws Exception {
        http
            .csrf(AbstractHttpConfigurer::disable)
            // CORS must be wired in via Spring Security so preflight (OPTIONS) requests
            // are handled BEFORE the auth filter rejects them as unauthenticated.
            .cors(c -> c.configurationSource(corsConfigurationSource))
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers(
                    "/auth/**",
                    "/.well-known/**",
                    "/v3/api-docs/**",
                    "/swagger-ui/**",
                    "/swagger-ui.html"
                ).permitAll()
                .requestMatchers("/admin/**").hasRole("ADMIN")
                .anyRequest().authenticated()
            )
            .oauth2ResourceServer(oauth -> oauth
                .jwt(jwt -> jwt.jwtAuthenticationConverter(jwtAuthenticationConverter()))
            );
        return http.build();
    }

    /**
     * Reads the {@code "roles"} claim (a list of strings like ["ADMIN", "VIEWER"])
     * and converts each into a Spring authority {@code ROLE_ADMIN}, {@code ROLE_VIEWER}.
     * The {@code hasRole("ADMIN")} matcher above expects the {@code ROLE_} prefix.
     */
    private JwtAuthenticationConverter jwtAuthenticationConverter() {
        JwtGrantedAuthoritiesConverter authorities = new JwtGrantedAuthoritiesConverter();
        authorities.setAuthoritiesClaimName("roles");
        authorities.setAuthorityPrefix("ROLE_");

        JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
        converter.setJwtGrantedAuthoritiesConverter(authorities);
        return converter;
    }
}
