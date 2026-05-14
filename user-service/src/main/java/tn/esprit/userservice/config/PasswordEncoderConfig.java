package tn.esprit.userservice.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;

/**
 * Argon2id password hashing. Memory- and CPU-hard, slow on purpose.
 * Tuned for ~300 ms per hash on a typical server CPU.
 *
 * Parameters (saltLength=16, hashLength=32, parallelism=1, memory=65536 KiB = 64 MiB, iterations=3)
 * follow OWASP 2023 recommendations for Argon2id.
 */
@Configuration
public class PasswordEncoderConfig {

    @Bean
    org.springframework.security.crypto.password.PasswordEncoder passwordEncoder() {
        return new Argon2PasswordEncoder(16, 32, 1, 65536, 3);
    }
}
