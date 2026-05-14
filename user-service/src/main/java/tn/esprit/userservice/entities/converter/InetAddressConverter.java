package tn.esprit.userservice.entities.converter;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

import java.net.InetAddress;
import java.net.UnknownHostException;

/**
 * Maps a Java {@link InetAddress} to a textual representation that PostgreSQL's
 * {@code inet} column accepts. Entities using this converter must also annotate
 * the column with {@code @ColumnTransformer(write = "?::inet")} so the JDBC
 * string parameter is cast to {@code inet} on write.
 */
@Converter
public class InetAddressConverter implements AttributeConverter<InetAddress, String> {

    @Override
    public String convertToDatabaseColumn(InetAddress attribute) {
        return attribute == null ? null : attribute.getHostAddress();
    }

    @Override
    public InetAddress convertToEntityAttribute(String dbData) {
        if (dbData == null || dbData.isBlank()) {
            return null;
        }
        try {
            return InetAddress.getByName(dbData);
        } catch (UnknownHostException e) {
            throw new IllegalStateException("Invalid IP address read from database: " + dbData, e);
        }
    }
}
