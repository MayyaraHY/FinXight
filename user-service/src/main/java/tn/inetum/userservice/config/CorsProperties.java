package tn.inetum.userservice.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.List;

/**
 * Mirrors {@code app.cors.*} entries in application.properties.
 *
 * <ul>
 *   <li>{@code allowedOrigins} — explicit list of frontend origins permitted to call this
 *       service. Spring Boot parses comma-separated property values into a {@code List}
 *       automatically. Never combine wildcards with credentials — the browser rejects it.</li>
 * </ul>
 */
@ConfigurationProperties(prefix = "app.cors")
public record CorsProperties(
        List<String> allowedOrigins
) {}
