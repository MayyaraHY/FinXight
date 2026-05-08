package tn.inetum.userservice.service;

import lombok.RequiredArgsConstructor;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tn.inetum.userservice.config.JwtProperties;
import tn.inetum.userservice.entities.RefreshToken;
import tn.inetum.userservice.entities.User;
import tn.inetum.userservice.exceptions.TokenExpiredException;
import tn.inetum.userservice.exceptions.TokenReusedException;
import tn.inetum.userservice.repository.RefreshTokenRepository;

import java.net.InetAddress;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

/**
 * Handles all token operations:
 *   - Minting short-lived JWT access tokens
 *   - Creating, rotating, and revoking refresh tokens
 *
 * HOW REFRESH TOKEN ROTATION WORKS
 * ---------------------------------
 * Every time the client uses a refresh token, we:
 *   1. Mark the old token as consumed (replaced_by = new token id)
 *   2. Issue a brand-new token with a new random value
 *   3. Return the new token
 *
 * This is called "token rotation". If an attacker steals the old token
 * and tries to use it after the legitimate client already rotated it,
 * we will see the old token is already consumed → "reuse detected" →
 * we revoke the entire token family (all tokens in that login session).
 * This forces the real user to log in again, ejecting the attacker.
 */
@Service
@RequiredArgsConstructor
public class TokenService {

    private final JwtEncoder jwtEncoder;
    private final JwtProperties jwtProperties;
    private final RefreshTokenRepository refreshTokenRepository;

    // ----------------------------------------------------------------
    //  JWT Access Token
    // ----------------------------------------------------------------

    /**
     * Creates a signed JWT containing the user's email (sub), UUID (uid),
     * and list of role names. Expires after app.jwt.access-token-expiry seconds.
     */
    public String mintAccessToken(User user) {
        Instant now = Instant.now();

        List<String> roles = user.getRoles().stream()
                .map(ur -> ur.getRole().getName().name())
                .toList();

        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer("user-service")
                .issuedAt(now)
                .expiresAt(now.plusSeconds(jwtProperties.accessTokenExpiry()))
                .subject(user.getEmail())
                .claim("uid", user.getId().toString())
                .claim("roles", roles)
                .build();

        return jwtEncoder.encode(JwtEncoderParameters.from(claims)).getTokenValue();
    }

    // ----------------------------------------------------------------
    //  Refresh Token — Create
    // ----------------------------------------------------------------

    /**
     * Issues a brand-new refresh token (start of a new session / token family).
     * Returns the raw UUID string that must be sent to the client as an HttpOnly cookie.
     * Only the SHA-256 hash is stored in the database.
     */
    @Transactional
    public String createRefreshToken(User user, String userAgent, InetAddress ipAddress) {
        String rawToken = UUID.randomUUID().toString();

        RefreshToken entity = new RefreshToken();
        entity.setUser(user);
        entity.setTokenHash(sha256(rawToken));
        entity.setExpiresAt(OffsetDateTime.now().plusSeconds(jwtProperties.refreshTokenExpiry()));
        entity.setAbsoluteExpiry(OffsetDateTime.now().plusSeconds(jwtProperties.refreshTokenAbsoluteExpiry()));
        entity.setUserAgent(userAgent);
        entity.setIpAddress(ipAddress);
        // familyId defaults to its own id (set in @PrePersist)

        refreshTokenRepository.save(entity);
        return rawToken;
    }

    // ----------------------------------------------------------------
    //  Refresh Token — Rotate
    // ----------------------------------------------------------------

    /**
     * Validates an incoming refresh token and issues a replacement.
     *
     * Steps:
     *   1. Hash the raw token and look it up in the DB
     *   2. Check it has not been revoked (reuse attack → revoke whole family)
     *   3. Check it has not expired
     *   4. Mark it as consumed (replaced_by = new token id)
     *   5. Issue and return a new token in the same family
     *
     * @param rawToken  the UUID value stored in the client's cookie
     * @param userAgent request User-Agent header
     * @param ipAddress client IP
     * @return the new raw token UUID (caller must update the cookie)
     */
    @Transactional
    public RotateResult rotateRefreshToken(String rawToken, String userAgent, InetAddress ipAddress) {
        String hash = sha256(rawToken);

        RefreshToken old = refreshTokenRepository.findByTokenHash(hash)
                .orElseThrow(() -> new TokenExpiredException("Refresh token not found"));

        // Token has already been used → possible theft → burn the whole family
        if (old.getReplacedBy() != null) {
            refreshTokenRepository.revokeByFamilyId(old.getFamilyId(), OffsetDateTime.now());
            throw new TokenReusedException("Refresh token reuse detected — all sessions revoked");
        }

        // Token was explicitly revoked (e.g. user logged out elsewhere)
        if (old.getRevokedAt() != null) {
            throw new TokenExpiredException("Refresh token has been revoked");
        }

        // Token has passed its rolling expiry
        if (old.getExpiresAt().isBefore(OffsetDateTime.now())) {
            throw new TokenExpiredException("Refresh token has expired");
        }

        // Absolute expiry — user must log in again (even if they kept refreshing)
        if (old.getAbsoluteExpiry().isBefore(OffsetDateTime.now())) {
            throw new TokenExpiredException("Session has expired — please log in again");
        }

        // Issue new token in the same family
        String newRawToken = UUID.randomUUID().toString();

        RefreshToken newEntity = new RefreshToken();
        newEntity.setUser(old.getUser());
        newEntity.setFamilyId(old.getFamilyId());  // keep the same family chain
        newEntity.setTokenHash(sha256(newRawToken));
        newEntity.setExpiresAt(OffsetDateTime.now().plusSeconds(jwtProperties.refreshTokenExpiry()));
        newEntity.setAbsoluteExpiry(old.getAbsoluteExpiry()); // absolute expiry does NOT reset
        newEntity.setUserAgent(userAgent);
        newEntity.setIpAddress(ipAddress);

        newEntity = refreshTokenRepository.save(newEntity);

        // Link old token → new token (marks it as consumed, not as re-usable)
        old.setReplacedBy(newEntity);
        refreshTokenRepository.save(old);

        return new RotateResult(newRawToken, old.getUser());
    }

    // ----------------------------------------------------------------
    //  Refresh Token — Revoke
    // ----------------------------------------------------------------

    /** Revoke a single token (used during normal logout). */
    @Transactional
    public void revokeRefreshToken(String rawToken) {
        refreshTokenRepository.findByTokenHash(sha256(rawToken)).ifPresent(t -> {
            t.setRevokedAt(OffsetDateTime.now());
            refreshTokenRepository.save(t);
        });
    }

    /** Revoke all tokens for a user (used during password reset or logout-everywhere). */
    @Transactional
    public void revokeAllUserTokens(UUID userId) {
        refreshTokenRepository.revokeAllByUserId(userId, OffsetDateTime.now());
    }

    // ----------------------------------------------------------------
    //  Helpers
    // ----------------------------------------------------------------

    /** SHA-256 hex digest. We never store raw tokens — only their hash. */
    public static String sha256(String input) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] bytes = digest.digest(input.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(bytes);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 algorithm not available", e);
        }
    }

    /** Returned by rotateRefreshToken — both the new raw token and the authenticated user. */
    public record RotateResult(String newRawToken, User user) {}
}
