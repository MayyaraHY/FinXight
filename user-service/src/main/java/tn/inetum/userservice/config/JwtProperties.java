package tn.inetum.userservice.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Mirrors the {@code app.jwt.*} entries in application.properties.
 *
 * <ul>
 *   <li>{@code privateKeyPath} / {@code publicKeyPath} — Spring Resource locators
 *       (e.g. {@code classpath:keys/private.pem} for dev, {@code file:/etc/secrets/...} for prod)</li>
 *   <li>{@code accessTokenExpiry} — seconds (default 900 = 15 min)</li>
 *   <li>{@code refreshTokenExpiry} — seconds (default 604800 = 7 days)</li>
 *   <li>{@code refreshTokenAbsoluteExpiry} — seconds (default 2592000 = 30 days)</li>
 * </ul>
 */
@ConfigurationProperties(prefix = "app.jwt")
public record JwtProperties(
        String privateKeyPath,
        String publicKeyPath,
        long accessTokenExpiry,
        long refreshTokenExpiry,
        long refreshTokenAbsoluteExpiry
) {}
