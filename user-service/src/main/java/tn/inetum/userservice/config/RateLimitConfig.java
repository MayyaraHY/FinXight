package tn.inetum.userservice.config;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.Refill;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;

/**
 * Provides factory methods for Bucket4j rate-limit buckets.
 *
 * We keep one bucket per IP address per endpoint type.
 * The RateLimitFilter manages the per-IP maps and calls these factories
 * when a new IP is seen for the first time.
 *
 * Example limits (from application.properties):
 *   login:         5 attempts per 60 seconds per IP
 *   forgotPassword: 3 attempts per 900 seconds (15 min) per IP
 */
@Configuration
public class RateLimitConfig {

    @Value("${app.rate-limit.login.capacity:5}")
    private int loginCapacity;

    @Value("${app.rate-limit.login.refill-seconds:60}")
    private long loginRefillSeconds;

    @Value("${app.rate-limit.forgot-password.capacity:3}")
    private int forgotPasswordCapacity;

    @Value("${app.rate-limit.forgot-password.refill-seconds:900}")
    private long forgotPasswordRefillSeconds;

    /**
     * Creates a new bucket for a single IP hitting /auth/login.
     * "greedy" refill: tokens are added continuously over the window, not all at once at the end.
     */
    public Bucket newLoginBucket() {
        Bandwidth limit = Bandwidth.classic(
                loginCapacity,
                Refill.greedy(loginCapacity, Duration.ofSeconds(loginRefillSeconds))
        );
        return Bucket.builder().addLimit(limit).build();
    }

    /**
     * Creates a new bucket for a single IP hitting /auth/forgot-password.
     */
    public Bucket newForgotPasswordBucket() {
        Bandwidth limit = Bandwidth.classic(
                forgotPasswordCapacity,
                Refill.greedy(forgotPasswordCapacity, Duration.ofSeconds(forgotPasswordRefillSeconds))
        );
        return Bucket.builder().addLimit(limit).build();
    }
}
