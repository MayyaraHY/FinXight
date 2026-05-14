package tn.esprit.userservice.service;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.thymeleaf.TemplateEngine;
import org.thymeleaf.context.Context;

/**
 * Sends HTML emails using Thymeleaf templates.
 *
 * Both methods are @Async — sending an email can take several hundred ms
 * (SMTP handshake, etc.) and we don't want the HTTP response to wait for it.
 * The user sees "check your inbox" immediately; the email is sent in the background.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class EmailService {

    private final JavaMailSender mailSender;
    private final TemplateEngine templateEngine;

    @Value("${spring.mail.username:noreply@example.com}")
    private String fromAddress;

    @Value("${app.frontend-url:http://localhost:3000}")
    private String frontendUrl;

    /**
     * Sends the "verify your email" email after registration.
     *
     * @param toEmail   recipient address
     * @param fullName  used in the greeting inside the template
     * @param rawToken  the UUID token value — appended to the frontend URL as ?token=...
     */
    @Async
    public void sendVerificationEmail(String toEmail, String fullName, String rawToken) {
        String verifyUrl = frontendUrl + "/verify-email?token=" + rawToken;

        Context ctx = new Context();
        ctx.setVariable("fullName", fullName);
        ctx.setVariable("verifyUrl", verifyUrl);

        String html = templateEngine.process("verify-email", ctx);
        sendHtmlEmail(toEmail, "Verify your email address", html);
    }

    /**
     * Sends the "reset your password" email after a forgot-password request.
     *
     * @param toEmail   recipient address
     * @param fullName  used in the greeting inside the template
     * @param rawToken  the UUID token value — appended to the frontend URL as ?token=...
     */
    @Async
    public void sendPasswordResetEmail(String toEmail, String fullName, String rawToken) {
        String resetUrl = frontendUrl + "/reset-password?token=" + rawToken;

        Context ctx = new Context();
        ctx.setVariable("fullName", fullName);
        ctx.setVariable("resetUrl", resetUrl);

        String html = templateEngine.process("reset-password", ctx);
        sendHtmlEmail(toEmail, "Reset your password", html);
    }

    // ----------------------------------------------------------------
    //  Internal helper
    // ----------------------------------------------------------------

    private void sendHtmlEmail(String to, String subject, String htmlBody) {
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
            helper.setFrom(fromAddress);
            helper.setTo(to);
            helper.setSubject(subject);
            helper.setText(htmlBody, true);  // true = this is HTML
            mailSender.send(message);
        } catch (MessagingException ex) {
            // Log but don't crash the request — the user can request another email
            log.error("Failed to send email to {}: {}", to, ex.getMessage(), ex);
        }
    }
}
