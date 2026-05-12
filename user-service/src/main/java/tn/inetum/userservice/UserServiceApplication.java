package tn.inetum.userservice;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@ConfigurationPropertiesScan   // auto-discovers @ConfigurationProperties records (Jwt, Cors, Cookie, RateLimit, ...)
@EnableScheduling              // activates @Scheduled in TokenCleanupService
@EnableAsync                   // activates @Async in AuditService and EmailService
public class UserServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(UserServiceApplication.class, args);
    }

}
