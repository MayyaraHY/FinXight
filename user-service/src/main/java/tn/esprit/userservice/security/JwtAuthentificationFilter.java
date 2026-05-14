package tn.esprit.userservice.security;

/**
 * JWT verification is handled automatically by Spring Security's built-in
 * BearerTokenAuthenticationFilter (activated via oauth2ResourceServer() in SecurityConfig).
 *
 * You do NOT need a custom filter for JWT — Spring reads the Authorization: Bearer <token>
 * header, passes it to JwtDecoder, and builds the Authentication object for you.
 *
 * This class is intentionally empty. It exists as a placeholder in case you need to
 * add custom token-processing logic later (e.g. checking token revocation in the DB on
 * every request — expensive but sometimes required for high-security scenarios).
 */
public class JwtAuthentificationFilter {
}
