package tn.esprit.userservice.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Serves user-uploaded profile pictures directly from the filesystem.
 *
 * Pictures are stored at {app.userprofile.pictures-dir} and exposed at
 * GET /userprofile/pictures/{filename}  — a public, unauthenticated endpoint
 * (images are embedded in HTML; browsers don't send Authorization headers
 * for <img> tags, so protecting this path would break the avatar display).
 */
@Configuration
public class WebMvcConfig implements WebMvcConfigurer {

    @Value("${app.userprofile.pictures-dir:userprofile/pictures}")
    private String picturesDir;

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        // Ensure the path ends with / for the file: location
        String location = picturesDir.endsWith("/")
                ? "file:" + picturesDir
                : "file:" + picturesDir + "/";

        registry.addResourceHandler("/userprofile/pictures/**")
                .addResourceLocations(location);
    }
}
