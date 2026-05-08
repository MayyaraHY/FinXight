package tn.inetum.userservice.dto.response;

/**
 * Returned by /auth/login and /auth/refresh.
 *
 * The access token goes in the body so the frontend can read it
 * and attach it as a Bearer header on API calls.
 *
 * The refresh token is NOT in this body — it is sent as an
 * HttpOnly cookie by the controller, which means JavaScript
 * cannot read or steal it.
 */
public record AuthResponse(
        String accessToken,
        String tokenType,
        long expiresIn,       // seconds until the access token expires
        UserResponse user
) {
    public static AuthResponse of(String accessToken, long expiresIn, UserResponse user) {
        return new AuthResponse(accessToken, "Bearer", expiresIn, user);
    }
}
