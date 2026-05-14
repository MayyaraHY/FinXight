package tn.esprit.userservice.exceptions;

public class TokenReusedException extends RuntimeException {
    public TokenReusedException(String message) {
        super(message);
    }
}
