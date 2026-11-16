package com.example.purchase.application;

import com.example.purchase.domain.DomainException;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** SEC-F05 (bcrypt byte limit) and SEC-F09 (LIKE wildcards / search length). */
class InputHardeningTest {

    @Test
    void searchWildcardsAreEscapedAndMatchLiterally() {
        assertThat(RequestSpecifications.containsPattern("q", "50%")).isEqualTo("%50\\%%");
        assertThat(RequestSpecifications.containsPattern("q", "a_b")).isEqualTo("%a\\_b%");
        assertThat(RequestSpecifications.containsPattern("q", "c:\\temp")).isEqualTo("%c:\\\\temp%");
        assertThat(RequestSpecifications.containsPattern("q", "  Notebook ")).isEqualTo("%notebook%");
    }

    @Test
    void overlongSearchTermsAreA400() {
        String tooLong = "x".repeat(RequestSpecifications.MAX_SEARCH_LENGTH + 1);
        assertThatThrownBy(() -> RequestSpecifications.containsPattern("q", tooLong))
                .isInstanceOfSatisfying(DomainException.Invalid.class,
                        e -> assertThat(e.errors()).singleElement().satisfies(f -> assertThat(f.field()).isEqualTo("q")));
    }

    @Test
    void passwordsAreLimitedTo72BytesNot72Characters() {
        assertThat(PasswordRules.fitsBcrypt("a1".repeat(36))).isTrue();          // 72 ASCII bytes
        String accented = "ã1".repeat(24);                                        // 48 chars, 72 bytes
        assertThat(PasswordRules.fitsBcrypt(accented)).isTrue();
        String emoji = "\uD83D\uDE00a1".repeat(12);                               // 48 chars, 72 bytes
        assertThat(PasswordRules.fitsBcrypt(emoji)).isTrue();
        String over = "ã1".repeat(25);                                            // 50 chars, 75 bytes
        assertThat(over.length()).isLessThanOrEqualTo(72);                        // passes @Size(max = 72)…
        assertThat(PasswordRules.fitsBcrypt(over)).isFalse();                     // …but not bcrypt
        assertThatThrownBy(() -> PasswordRules.requireBcryptCompatible(over)).isInstanceOf(DomainException.Invalid.class);
        assertThatCode(() -> PasswordRules.requireBcryptCompatible("Senha1234")).doesNotThrowAnyException();
    }
}
