package tn.esprit.userservice.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Body of PUT /users/me (authenticated endpoint). */
public record UpdateProfileRequest(

        @NotBlank @Size(max = 100)
        String firstName,

        @Size(max = 100)
        String lastName,

        @Size(max = 30)
        String phone,

        String address,

        @Size(max = 100)
        String position,

        @Size(max = 500)
        String pictureUrl
) {}
