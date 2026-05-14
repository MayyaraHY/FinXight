package tn.esprit.userservice.exceptions;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import tn.esprit.userservice.dto.response.ErrorResponse;

import java.util.Map;
import java.util.stream.Collectors;

/**
 * Central place that converts exceptions into HTTP responses.
 *
 * Every @RestController in the application shares these handlers.
 * The pattern is simple:
 *   throw SomeException in your service
 *   → Spring catches it here
 *   → we return a clean JSON error body with the right HTTP status
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    /** 409 Conflict — email already taken */
    @ExceptionHandler(EmailAlreadyexistsException.class)
    public ResponseEntity<ErrorResponse> handleEmailExists(EmailAlreadyexistsException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(ErrorResponse.of(409, "Conflict", ex.getMessage()));
    }

    /** 404 Not Found — user not found, or "invalid credentials" (we never say which is wrong) */
    @ExceptionHandler(UserNotFoundException.class)
    public ResponseEntity<ErrorResponse> handleUserNotFound(UserNotFoundException ex) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(ErrorResponse.of(401, "Unauthorized", "Invalid credentials"));
    }

    /** 401 Unauthorized — account is locked */
    @ExceptionHandler(AccountLockedException.class)
    public ResponseEntity<ErrorResponse> handleLocked(AccountLockedException ex) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(ErrorResponse.of(401, "Unauthorized", ex.getMessage()));
    }

    /** 401 Unauthorized — refresh token expired, revoked, or not found */
    @ExceptionHandler(TokenExpiredException.class)
    public ResponseEntity<ErrorResponse> handleTokenExpired(TokenExpiredException ex) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(ErrorResponse.of(401, "Unauthorized", ex.getMessage()));
    }

    /** 401 Unauthorized — refresh token was reused (possible theft) */
    @ExceptionHandler(TokenReusedException.class)
    public ResponseEntity<ErrorResponse> handleTokenReuse(TokenReusedException ex) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(ErrorResponse.of(401, "Unauthorized", ex.getMessage()));
    }

    /**
     * 400 Bad Request — @Valid constraint failed on a request body field.
     * Returns a map of fieldName → error message so the frontend can highlight the right field.
     */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> handleValidation(MethodArgumentNotValidException ex) {
        Map<String, String> fieldErrors = ex.getBindingResult().getFieldErrors().stream()
                .collect(Collectors.toMap(
                        FieldError::getField,
                        fe -> fe.getDefaultMessage() != null ? fe.getDefaultMessage() : "Invalid value",
                        (a, b) -> a  // keep first message if field has multiple violations
                ));

        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(Map.of(
                        "status", 400,
                        "error", "Validation Failed",
                        "fields", fieldErrors
                ));
    }

    /** 400 Bad Request — current password is wrong (from changePassword) */
    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ErrorResponse> handleIllegalArg(IllegalArgumentException ex) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ErrorResponse.of(400, "Bad Request", ex.getMessage()));
    }

    /** 500 Internal Server Error — catch-all for anything we didn't anticipate */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleGeneric(Exception ex) {
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ErrorResponse.of(500, "Internal Server Error",
                        "An unexpected error occurred. Please try again later."));
    }
}
