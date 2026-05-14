package tn.esprit.userservice.dto.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

/** Body of POST /auth/login. */
public record LoginRequest(

        @NotBlank
        @Email
        String email,

        @NotBlank
        String password
) {}
