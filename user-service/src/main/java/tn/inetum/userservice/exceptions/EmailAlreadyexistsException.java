package tn.inetum.userservice.exceptions;

public class EmailAlreadyexistsException extends RuntimeException {
    public EmailAlreadyexistsException(String message) {
        super(message);
    }
}
