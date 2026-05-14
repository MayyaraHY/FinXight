package tn.esprit.userservice.dto.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

/** Body of POST /auth/forgot-password. */
public record ForgotPasswordRequest(

        @NotBlank
        @Email
        String email
) {}
