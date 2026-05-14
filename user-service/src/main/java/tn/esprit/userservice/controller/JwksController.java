package tn.esprit.userservice.controller;

import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirements;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Publishes the RSA public key as a JSON Web Key Set (JWKS) at the
 * RFC 8615 well-known location {@code /.well-known/jwks.json}.
 *
 * <p>Verifying services (backend, ai-service, future API gateway) fetch this
 * once at startup, cache it in memory, and use it to verify the signature of
 * every incoming JWT — no per-request call back to user-service is needed.</p>
 *
 * <p>The endpoint is intentionally public. The published key is the
 * <em>public</em> half of the RSA pair only — {@link RSAKey#toPublicJWK()}
 * strips the private components ({@code d, p, q, dp, dq, qi}) before
 * serialization. See {@code docs/jwt-contract.md} for the full contract.</p>
 */
@Tag(name = "JWKS", description = "Public key publication for JWT signature verification")
@SecurityRequirements // public — no JWT required
@RestController
@RequestMapping("/.well-known")
@RequiredArgsConstructor
public class JwksController {

    private final RSAKey rsaJwk;

    @Operation(summary = "JSON Web Key Set",
               description = "Returns the public key(s) used to verify JWT signatures issued by this service. " +
                             "Match the JWT header's `kid` against the `kid` of an entry in the `keys` array.")
    @ApiResponse(responseCode = "200", description = "JWK Set document — see RFC 7517")
    @GetMapping("/jwks.json")
    public Map<String, Object> jwks() {
        return new JWKSet(rsaJwk.toPublicJWK()).toJSONObject();
    }
}
