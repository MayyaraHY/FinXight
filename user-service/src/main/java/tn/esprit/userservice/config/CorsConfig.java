package tn.esprit.userservice.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

/**
 * CORS policy for cross-origin browser callers.
 *
 * <p>Wired into the security filter chain by {@link SecurityConfig} via
 * {@code .cors(c -> c.configurationSource(corsConfigurationSource))}. The bean
 * lives in its own configuration class so the security file stays focused on
 * authentication / authorization rules.</p>
 *
 * <p>Allowed origins come from {@code app.cors.allowed-origins} —
 * see {@link CorsProperties} and {@code application.properties}.</p>
 */
@Configuration
@EnableConfigurationProperties(CorsProperties.class)
public class CorsConfig {

    private final CorsProperties properties;

    public CorsConfig(CorsProperties properties) {
        this.properties = properties;
    }

    @Bean
    CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();

        // Explicit origin list — never "*" together with credentials.
        config.setAllowedOrigins(properties.allowedOrigins());

        config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));

        // Required for the HttpOnly refresh-token cookie to travel back from the browser.
        // Pairs with `credentials: "include"` on the frontend fetch.
        config.setAllowCredentials(true);

        // Cache preflight response for 1h — fewer OPTIONS round-trips.
        config.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }
}
