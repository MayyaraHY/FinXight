package tn.esprit.userservice.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Configures the Swagger UI appearance and registers the Bearer JWT security scheme.
 *
 * After this is set up:
 *   - Visit http://localhost:8080/swagger-ui.html
 *   - Click "Authorize" and paste your access token
 *   - All 🔒 endpoints will automatically include the Authorization header
 */
@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI openAPI() {
        return new OpenAPI()
                .info(new Info()
                        .title("User Service API")
                        .description("Authentication, user profile, and admin management endpoints")
                        .version("1.0.0"))
                // Apply bearer auth globally — individual endpoints that are public will still work
                .addSecurityItem(new SecurityRequirement().addList("bearerAuth"))
                .components(new Components()
                        .addSecuritySchemes("bearerAuth", new SecurityScheme()
                                .name("bearerAuth")
                                .type(SecurityScheme.Type.HTTP)
                                .scheme("bearer")
                                .bearerFormat("JWT")
                                .description("Paste the access token returned by /auth/login")));
    }
}
