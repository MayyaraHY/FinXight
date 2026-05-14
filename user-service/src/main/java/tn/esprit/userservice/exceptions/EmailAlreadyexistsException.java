package tn.esprit.userservice.exceptions;

public class EmailAlreadyexistsException extends RuntimeException {
    public EmailAlreadyexistsException(String message) {
        super(message);
    }
}
