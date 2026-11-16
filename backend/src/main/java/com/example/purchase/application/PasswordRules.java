package com.example.purchase.application;

import com.example.purchase.domain.DomainException;

import java.nio.charset.StandardCharsets;

/**
 * bcrypt only uses the first 72 BYTES of a password (SEC-F05). Bean validation counts characters, so a
 * 40-character password of accented letters or emoji passes {@code @Size(max = 72)} but is longer than 72 bytes:
 * older encoders silently truncate it, recent Spring Security throws (→ 500). Reject it with a field error.
 */
final class PasswordRules {

    static final int BCRYPT_MAX_BYTES = 72;

    private PasswordRules() {}

    static boolean fitsBcrypt(String password) {
        return password != null && password.getBytes(StandardCharsets.UTF_8).length <= BCRYPT_MAX_BYTES;
    }

    static void requireBcryptCompatible(String password) {
        if (!fitsBcrypt(password)) {
            throw DomainException.Invalid.field("password",
                    "No máximo %d bytes (letras acentuadas e emojis ocupam mais de um).".formatted(BCRYPT_MAX_BYTES));
        }
    }
}
