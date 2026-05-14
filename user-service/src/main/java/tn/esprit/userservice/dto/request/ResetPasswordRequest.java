package tn.esprit.userservice.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Body of POST /auth/reset-password. */
public record ResetPasswordRequest(

        /** The raw token from the email link (e.g. ?token=UUID). */
        @NotBlank
        String token,

        @NotBlank
        @Size(min = 8, max = 128, message = "Password must be 8–128 characters")
        String newPassword
) {}
