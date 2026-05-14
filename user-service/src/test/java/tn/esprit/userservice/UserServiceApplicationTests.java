package tn.esprit.userservice;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import tn.esprit.userservice.repository.AuditLogRepository;
import tn.esprit.userservice.repository.EmailVerificationTokenRepository;
import tn.esprit.userservice.repository.PasswordResetTokenRepository;
import tn.esprit.userservice.repository.RefreshTokenRepository;
import tn.esprit.userservice.repository.RoleRepository;
import tn.esprit.userservice.repository.UserRepository;
import tn.esprit.userservice.repository.UserRoleRepository;

/**
 * Smoke test: verifies that the Spring application context loads without errors.
 *
 * Infrastructure (DB, mail) is mocked so this test runs without Docker or an SMTP server.
 * The test properties in src/test/resources/application.properties exclude JPA autoconfiguration,
 * so we provide mock beans for all the repositories here.
 *
 * This test catches wiring mistakes — missing beans, circular dependencies, bad config — early.
 */
@SpringBootTest
class UserServiceApplicationTests {

    // Mock the JPA repositories (JPA autoconfiguration is excluded in test properties)
    @MockitoBean UserRepository userRepository;
    @MockitoBean RoleRepository roleRepository;
    @MockitoBean UserRoleRepository userRoleRepository;
    @MockitoBean RefreshTokenRepository refreshTokenRepository;
    @MockitoBean PasswordResetTokenRepository passwordResetTokenRepository;
    @MockitoBean EmailVerificationTokenRepository emailVerificationTokenRepository;
    @MockitoBean AuditLogRepository auditLogRepository;

    // Mock JavaMailSender (mail autoconfiguration is excluded in test properties)
    @MockitoBean JavaMailSender javaMailSender;

    @Test
    void contextLoads() {
        // If Spring can wire all beans with the above mocks, the test passes.
        // No assertions needed — context startup failure is the test failure.
    }
}
