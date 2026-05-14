package tn.esprit.userservice.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import java.util.UUID;

@Service
public class PictureStorageService {
    private static final long   MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
    private static final List<String> ALLOWED_TYPES = List.of("image/jpeg", "image/png", "image/webp");

    @Value("${app.userprofile.pictures-dir:userprofile/pictures}")
    private String picturesDir;
    @Value("${app.frontend-url}")
    private String frontendUrl;

    public String store(MultipartFile file) throws IOException {
        if (file == null || file.isEmpty()) return null;

        if (!ALLOWED_TYPES.contains(file.getContentType())) {
            throw new IllegalArgumentException("Only JPEG, PNG, and WEBP images are allowed.");
        }
        if (file.getSize() > MAX_SIZE_BYTES) {
            throw new IllegalArgumentException("Image must be smaller than 5 MB.");
        }

        String extension = StringUtils.getFilenameExtension(file.getOriginalFilename());
        String filename   = UUID.randomUUID() + (extension != null ? "." + extension : "");

        Path dest = Paths.get(picturesDir, filename);
        Files.createDirectories(dest.getParent());
        file.transferTo(dest);

        // Return a publicly accessible URL
        return frontendUrl + "/userprofile/pictures/" + filename;
    }
}
