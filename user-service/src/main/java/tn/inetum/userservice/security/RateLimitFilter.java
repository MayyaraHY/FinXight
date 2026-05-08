package tn.inetum.userservice.security;

import io.github.bucket4j.Bucket;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import tn.inetum.userservice.config.RateLimitConfig;

import java.io.IOException;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

/**
 * Servlet filter that applies per-IP rate limits to sensitive endpoints.
 *
 * HOW IT WORKS
 * ============
 * 1. Every incoming request runs through this filter first.
 * 2. We only act on /auth/login and /auth/forgot-password — all other paths pass through.
 * 3. We extract the client IP (or X-Forwarded-For if behind a proxy).
 * 4. We look up (or create) a token-bucket for that IP.
 * 5. We try to consume 1 token. If the bucket is empty → 429 Too Many Requests.
 * 6. If a token was consumed → let the request pass.
 *
 * The bucket is created lazily on first request from an IP, and reused for all subsequent ones.
 * This means memory grows with the number of unique IPs. For production, move to a distributed
 * cache (Redis) so multiple instances share the same counters.
 */
@Component
@RequiredArgsConstructor
public class RateLimitFilter extends OncePerRequestFilter {

    private final RateLimitConfig rateLimitConfig;

    // One map per endpoint type — keyed by client IP
    private final ConcurrentMap<String, Bucket> loginBuckets         = new ConcurrentHashMap<>();
    private final ConcurrentMap<String, Bucket> forgotPasswordBuckets = new ConcurrentHashMap<>();

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain chain)
            throws ServletException, IOException {

        String path = request.getServletPath();

        if (path.equals("/auth/login")) {
            String ip = extractIp(request);
            Bucket bucket = loginBuckets.computeIfAbsent(ip, k -> rateLimitConfig.newLoginBucket());
            if (!bucket.tryConsume(1)) {
                sendTooManyRequests(response, "Too many login attempts. Please wait before trying again.");
                return;
            }
        } else if (path.equals("/auth/forgot-password")) {
            String ip = extractIp(request);
            Bucket bucket = forgotPasswordBuckets.computeIfAbsent(ip, k -> rateLimitConfig.newForgotPasswordBucket());
            if (!bucket.tryConsume(1)) {
                sendTooManyRequests(response, "Too many password-reset requests. Please wait before trying again.");
                return;
            }
        }

        chain.doFilter(request, response);
    }

    // ----------------------------------------------------------------
    //  Helpers
    // ----------------------------------------------------------------

    /**
     * Extracts the real client IP.
     * X-Forwarded-For is set by reverse proxies (nginx, load balancers).
     * If it's absent we fall back to the direct connection IP.
     */
    private String extractIp(HttpServletRequest request) {
        String xff = request.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) {
            // X-Forwarded-For can be a comma-separated chain; the leftmost is the original client
            return xff.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }

    private void sendTooManyRequests(HttpServletResponse response, String message) throws IOException {
        response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.getWriter().write(
                "{\"status\":429,\"error\":\"Too Many Requests\",\"message\":\"" + message + "\"}"
        );
    }
}
