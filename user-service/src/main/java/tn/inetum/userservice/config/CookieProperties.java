package tn.inetum.userservice.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Mirrors {@code app.cookie.*} entries in application.properties.
 *
 * <ul>
 *   <li>{@code secure}    — when true, browser only sends the cookie over HTTPS.
 *       Must be {@code true} in production. Set to {@code false} for local HTTP dev,
 *       otherwise the refresh-token cookie never travels back.</li>
 *   <li>{@code sameSite}  — {@code Strict}, {@code Lax}, or {@code None}.
 *       {@code Lax} works for cross-port localhost dev (e.g. :3000 ↔ :8080).
 *       {@code Strict} is the production default behind a same-origin gateway.</li>
 * </ul>
 */
@ConfigurationProperties(prefix = "app.cookie")
public record CookieProperties(
        boolean secure,
        String sameSite
) {}
