package tn.esprit.userservice.dto.request;

import jakarta.validation.constraints.NotNull;
import tn.esprit.userservice.entities.enums.RoleName;

/**
 * Body for POST /admin/users/{id}/roles/grant  and  /roles/revoke.
 * Example: { "role": "ACCOUNTANT" }
 */
public record GrantRoleRequest(
        @NotNull(message = "role is required")
        RoleName role
) {}
