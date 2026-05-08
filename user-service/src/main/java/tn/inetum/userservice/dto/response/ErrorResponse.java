package tn.inetum.userservice.dto.response;

import java.time.OffsetDateTime;

/**
 * Standard error body returned by GlobalExceptionHandler.
 * Every API error has the same shape so the frontend can handle it uniformly.
 */
public record ErrorResponse(
        int status,
        String error,
        String message,
        OffsetDateTime timestamp
) {
    public static ErrorResponse of(int status, String error, String message) {
        return new ErrorResponse(status, error, message, OffsetDateTime.now());
    }
}
