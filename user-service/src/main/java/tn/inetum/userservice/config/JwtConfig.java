package tn.inetum.userservice.config;

import com.nimbusds.jose.jwk.JWK;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jose.jwk.source.ImmutableJWKSet;
import com.nimbusds.jose.jwk.source.JWKSource;
import com.nimbusds.jose.proc.SecurityContext;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.Resource;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.interfaces.RSAPrivateKey;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;
import java.util.UUID;

/**
 * Loads the RS256 keypair and exposes encoder/decoder beans for Spring Security's JWT support.
 *
 * - {@link JwtEncoder} — used by AuthService to mint access tokens.
 * - {@link JwtDecoder} — used by Spring Security's resource-server filter to verify incoming tokens.
 */
@Configuration
@EnableConfigurationProperties(JwtProperties.class)
public class JwtConfig {

    private final JwtProperties properties;
    private final ApplicationContext context;

    public JwtConfig(JwtProperties properties, ApplicationContext context) {
        this.properties = properties;
        this.context = context;
    }

    @Bean
    RSAPublicKey rsaPublicKey() throws Exception {
        byte[] der = readPemBody(properties.publicKeyPath(), "PUBLIC KEY");
        return (RSAPublicKey) KeyFactory.getInstance("RSA")
                .generatePublic(new X509EncodedKeySpec(der));
    }

    @Bean
    RSAPrivateKey rsaPrivateKey() throws Exception {
        byte[] der = readPemBody(properties.privateKeyPath(), "PRIVATE KEY");
        return (RSAPrivateKey) KeyFactory.getInstance("RSA")
                .generatePrivate(new PKCS8EncodedKeySpec(der));
    }

    @Bean
    JwtDecoder jwtDecoder(RSAPublicKey publicKey) {
        return NimbusJwtDecoder.withPublicKey(publicKey).build();
    }

    @Bean
    JwtEncoder jwtEncoder(RSAPublicKey publicKey, RSAPrivateKey privateKey) {
        RSAKey jwk = new RSAKey.Builder(publicKey)
                .privateKey(privateKey)
                .keyID(UUID.randomUUID().toString())
                .build();
        JWKSource<SecurityContext> jwks = new ImmutableJWKSet<>(new JWKSet(jwk));
        return new NimbusJwtEncoder(jwks);
    }

    /**
     * Reads a PEM-encoded key from a Spring Resource location (classpath:, file:, etc.),
     * strips the {@code -----BEGIN ...-----} / {@code -----END ...-----} headers,
     * and base64-decodes the body to raw DER bytes.
     */
    private byte[] readPemBody(String resourceLocation, String keyType) throws IOException {
        Resource resource = context.getResource(resourceLocation);
        try (InputStream in = resource.getInputStream()) {
            String pem = new String(in.readAllBytes(), StandardCharsets.UTF_8);
            String body = pem
                    .replace("-----BEGIN " + keyType + "-----", "")
                    .replace("-----END " + keyType + "-----", "")
                    .replaceAll("\\s+", "");
            return Base64.getDecoder().decode(body);
        }
    }
}
