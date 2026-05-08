package tn.inetum.userservice.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tn.inetum.userservice.dto.request.ForgotPasswordRequest;
import tn.inetum.userservice.dto.request.LoginRequest;
import tn.inetum.userservice.dto.request.RegisterRequest;
import tn.inetum.userservice.dto.request.ResetPasswordRequest;
import tn.inetum.userservice.dto.response.UserResponse;
import tn.inetum.userservice.entities.EmailVerificationToken;
import tn.inetum.userservice.entities.PasswordResetToken;
import tn.inetum.userservice.entities.Role;
import tn.inetum.userservice.entities.User;
import tn.inetum.userservice.entities.UserRole;
import tn.inetum.userservice.entities.UserRoleId;
import tn.inetum.userservice.entities.enums.AuditEventType;
import tn.inetum.userservice.entities.enums.RoleName;
import tn.inetum.userservice.exceptions.AccountLockedException;
import tn.inetum.userservice.exceptions.EmailAlreadyexistsException;
import tn.inetum.userservice.exceptions.TokenExpiredException;
import tn.inetum.userservice.exceptions.UserNotFoundException;
import tn.inetum.userservice.repository.EmailVerificationTokenRepository;
import tn.inetum.userservice.repository.PasswordResetTokenRepository;
import tn.inetum.userservice.repository.RoleRepository;
import tn.inetum.userservice.repository.UserRepository;
import tn.inetum.userservice.repository.UserRoleRepository;

import java.net.InetAddress;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Contains all authentication business logic.
 *
 * The controller layer is thin — it just parses HTTP and calls these methods.
 * All decisions (lock account? valid token? email taken?) live here.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AuthService {

    // ---- How many wrong passwords before the account is locked ----
    private static final int MAX_FAILED_LOGINS = 5;
    // ---- How long the account stays locked ----
    private static final int LOCK_DURATION_MINUTES = 30;
    // ---- How long reset/verify tokens are valid ----
    private static final int RESET_TOKEN_EXPIRY_HOURS = 1;
    private static final int VERIFY_TOKEN_EXPIRY_HOURS = 24;

    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final UserRoleRepository userRoleRepository;
    private final PasswordResetTokenRepository passwordResetTokenRepository;
    private final EmailVerificationTokenRepository emailVerificationTokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final TokenService tokenService;
    private final EmailService emailService;
    private final AuditService auditService;

    // ================================================================
    //  REGISTER
    // ================================================================

    /**
     * Creates a new user account.
     *
     * Steps:
     *   1. Reject if email already exists
     *   2. Hash the password with Argon2id
     *   3. Save the user
     *   4. Assign the default VIEWER role
     *   5. Create an email verification token and send the verification email
     *   6. Write an audit log entry
     */
    @Transactional
    public void register(RegisterRequest req, InetAddress ipAddress, String userAgent) {
        if (userRepository.existsByEmail(req.email().toLowerCase())) {
            throw new EmailAlreadyexistsException("An account with this email already exists");
        }

        // Create the user
        User user = new User();
        user.setEmail(req.email());
        user.setFullName(req.fullName());
        user.setHashedPassword(passwordEncoder.encode(req.password()));
        userRepository.save(user);

        // Assign default VIEWER role
        Role viewerRole = roleRepository.findByName(RoleName.VIEWER)
                .orElseThrow(() -> new IllegalStateException("VIEWER role not found in database"));

        UserRole userRole = new UserRole();
        userRole.setId(new UserRoleId(user.getId(), viewerRole.getId()));
        userRole.setUser(user);
        userRole.setRole(viewerRole);
        userRoleRepository.save(userRole);

        // Create email verification token
        String rawVerifyToken = UUID.randomUUID().toString();
        EmailVerificationToken verifyToken = new EmailVerificationToken();
        verifyToken.setUser(user);
        verifyToken.setTokenHash(TokenService.sha256(rawVerifyToken));
        verifyToken.setExpiresAt(OffsetDateTime.now().plusHours(VERIFY_TOKEN_EXPIRY_HOURS));
        emailVerificationTokenRepository.save(verifyToken);

        // Send verification email (async — won't block the response)
        emailService.sendVerificationEmail(user.getEmail(), user.getFullName(), rawVerifyToken);

        // Audit
        auditService.log(AuditEventType.REGISTER, user, ipAddress, userAgent,
                "{\"email\":\"" + user.getEmail() + "\"}");
    }

    // ================================================================
    //  LOGIN
    // ================================================================

    /**
     * Authenticates a user and returns tokens.
     *
     * Steps:
     *   1. Load user by email
     *   2. Check account is not locked
     *   3. Verify the password
     *   4a. If wrong password → increment failure counter, lock if threshold reached, audit
     *   4b. If correct → reset counter, update last_login, mint JWT + refresh token, audit
     */
    @Transactional
    public LoginResult login(LoginRequest req, InetAddress ipAddress, String userAgent) {
        User user = userRepository.findByEmail(req.email().toLowerCase())
                .orElseThrow(() -> {
                    auditService.log(AuditEventType.LOGIN_FAILED, ipAddress, userAgent,
                            "{\"reason\":\"unknown email\",\"email\":\"" + req.email() + "\"}");
                    return new UserNotFoundException("Invalid credentials");
                });

        // Is the account temporarily locked?
        if (user.getLockedUntil() != null && user.getLockedUntil().isAfter(OffsetDateTime.now())) {
            auditService.log(AuditEventType.LOGIN_FAILED, user, ipAddress, userAgent,
                    "{\"reason\":\"account locked\"}");
            throw new AccountLockedException("Account is locked until " + user.getLockedUntil());
        }

        // Wrong password?
        if (!passwordEncoder.matches(req.password(), user.getHashedPassword())) {
            int failures = user.getFailedLoginCount() + 1;
            user.setFailedLoginCount(failures);

            if (failures >= MAX_FAILED_LOGINS) {
                user.setLockedUntil(OffsetDateTime.now().plusMinutes(LOCK_DURATION_MINUTES));
                auditService.log(AuditEventType.ACCOUNT_LOCKED, user, ipAddress, userAgent,
                        "{\"failedAttempts\":" + failures + "}");
            } else {
                auditService.log(AuditEventType.LOGIN_FAILED, user, ipAddress, userAgent,
                        "{\"failedAttempts\":" + failures + "}");
            }
            userRepository.save(user);
            throw new UserNotFoundException("Invalid credentials");
        }

        // Correct password — reset counters and record this login
        user.setFailedLoginCount(0);
        user.setLockedUntil(null);
        user.setLastLoginAt(OffsetDateTime.now());
        user.setLastLoginIp(ipAddress);
        userRepository.save(user);

        // Create tokens
        String accessToken = tokenService.mintAccessToken(user);
        String rawRefreshToken = tokenService.createRefreshToken(user, userAgent, ipAddress);

        // Convert to DTO while still inside the transaction (user.roles is a lazy collection —
        // it must be accessed before the session closes)
        UserResponse userResponse = UserResponse.from(user);

        auditService.log(AuditEventType.LOGIN_SUCCESS, user, ipAddress, userAgent, null);

        return new LoginResult(accessToken, rawRefreshToken, userResponse);
    }

    // ================================================================
    //  LOGOUT
    // ================================================================

    /**
     * Revokes the refresh token stored in the client's cookie.
     * After this call the cookie value is useless — it cannot be rotated.
     */
    @Transactional
    public void logout(String rawRefreshToken, InetAddress ipAddress, String userAgent) {
        if (rawRefreshToken == null || rawRefreshToken.isBlank()) return;

        tokenService.revokeRefreshToken(rawRefreshToken);
        auditService.log(AuditEventType.LOGOUT, ipAddress, userAgent, null);
    }

    // ================================================================
    //  REFRESH TOKENS
    // ================================================================

    /**
     * Validates the old refresh token and issues a new access + refresh token pair.
     * The old refresh token cookie must be replaced with the new one.
     */
    @Transactional
    public LoginResult refreshTokens(String rawRefreshToken, InetAddress ipAddress, String userAgent) {
        TokenService.RotateResult result = tokenService.rotateRefreshToken(rawRefreshToken, userAgent, ipAddress);

        String newAccessToken = tokenService.mintAccessToken(result.user());

        // Build DTO while session is still open
        UserResponse userResponse = UserResponse.from(result.user());

        auditService.log(AuditEventType.TOKEN_REFRESHED, result.user(), ipAddress, userAgent, null);

        return new LoginResult(newAccessToken, result.newRawToken(), userResponse);
    }

    // ================================================================
    //  FORGOT PASSWORD
    // ================================================================

    /**
     * Sends a password-reset email.
     *
     * IMPORTANT: we always return the same response whether the email exists or not.
     * This prevents user enumeration (attackers can't tell which emails are registered).
     */
    @Transactional
    public void forgotPassword(ForgotPasswordRequest req, InetAddress ipAddress, String userAgent) {
        userRepository.findByEmail(req.email().toLowerCase()).ifPresent(user -> {
            String rawToken = UUID.randomUUID().toString();
            PasswordResetToken resetToken = new PasswordResetToken();
            resetToken.setUser(user);
            resetToken.setTokenHash(TokenService.sha256(rawToken));
            resetToken.setExpiresAt(OffsetDateTime.now().plusHours(RESET_TOKEN_EXPIRY_HOURS));
            passwordResetTokenRepository.save(resetToken);

            emailService.sendPasswordResetEmail(user.getEmail(), user.getFullName(), rawToken);

            auditService.log(AuditEventType.PASSWORD_RESET_REQUESTED, user, ipAddress, userAgent, null);
        });
    }

    // ================================================================
    //  RESET PASSWORD
    // ================================================================

    /**
     * Validates the one-time reset token from the email link and sets the new password.
     * Also revokes all refresh tokens (forces re-login on all devices).
     */
    @Transactional
    public void resetPassword(ResetPasswordRequest req, InetAddress ipAddress, String userAgent) {
        String hash = TokenService.sha256(req.token());

        PasswordResetToken resetToken = passwordResetTokenRepository.findByTokenHash(hash)
                .orElseThrow(() -> new TokenExpiredException("Reset link is invalid or has expired"));

        if (resetToken.getUsedAt() != null) {
            throw new TokenExpiredException("This reset link has already been used");
        }
        if (resetToken.getExpiresAt().isBefore(OffsetDateTime.now())) {
            throw new TokenExpiredException("Reset link has expired");
        }

        User user = resetToken.getUser();
        user.setHashedPassword(passwordEncoder.encode(req.newPassword()));
        user.setFailedLoginCount(0);
        user.setLockedUntil(null);
        userRepository.save(user);

        // Mark the token as used so it cannot be reused
        resetToken.setUsedAt(OffsetDateTime.now());
        passwordResetTokenRepository.save(resetToken);

        // Revoke all refresh tokens — the user must log in fresh on all devices
        tokenService.revokeAllUserTokens(user.getId());

        auditService.log(AuditEventType.PASSWORD_RESET, user, ipAddress, userAgent, null);
    }

    // ================================================================
    //  VERIFY EMAIL
    // ================================================================

    /**
     * Marks the user's email as verified using the token from the verification link.
     */
    @Transactional
    public void verifyEmail(String rawToken, InetAddress ipAddress, String userAgent) {
        String hash = TokenService.sha256(rawToken);

        EmailVerificationToken verifyToken = emailVerificationTokenRepository.findByTokenHash(hash)
                .orElseThrow(() -> new TokenExpiredException("Verification link is invalid or has expired"));

        if (verifyToken.getUsedAt() != null) {
            throw new TokenExpiredException("This verification link has already been used");
        }
        if (verifyToken.getExpiresAt().isBefore(OffsetDateTime.now())) {
            throw new TokenExpiredException("Verification link has expired");
        }

        User user = verifyToken.getUser();
        user.setVerified(true);
        userRepository.save(user);

        verifyToken.setUsedAt(OffsetDateTime.now());
        emailVerificationTokenRepository.save(verifyToken);

        auditService.log(AuditEventType.EMAIL_VERIFIED, user, ipAddress, userAgent, null);
    }

    // ================================================================
    //  Result type
    // ================================================================

    /**
     * Bundles the two tokens and user DTO together so the controller can set the cookie + body.
     * Using UserResponse (not User entity) avoids lazy-loading issues after the transaction closes.
     */
    public record LoginResult(String accessToken, String rawRefreshToken, UserResponse userResponse) {}
}
