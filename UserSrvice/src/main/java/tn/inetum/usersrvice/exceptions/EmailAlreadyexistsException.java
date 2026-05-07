package tn.inetum.usersrvice.exceptions;

public class EmailAlreadyexistsException extends RuntimeException {
    public EmailAlreadyexistsException(String message) {
        super(message);
    }
}
