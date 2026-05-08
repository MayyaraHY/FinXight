package tn.inetum.userservice.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Body of PUT /users/me (authenticated endpoint). */
public record UpdateProfileRequest(

        @NotBlank
        @Size(max = 255)
        String fullName
) {}
