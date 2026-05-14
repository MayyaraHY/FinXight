package tn.esprit.userservice.config;

import org.springframework.context.annotation.Configuration;

/**
 * Spring Boot auto-configures JavaMailSender from the spring.mail.* properties in
 * application.properties, so no bean definitions are needed here.
 *
 * This class is intentionally empty. It exists as a placeholder in case you need to
 * add mail customisations later (e.g. custom SSL config, DKIM signing, etc.).
 */
@Configuration
public class MailConfig {
}
