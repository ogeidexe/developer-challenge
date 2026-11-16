package com.example.purchase.security;

import com.example.purchase.config.AppProperties;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.JwtException;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.function.UnaryOperator;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Token validation of {@link SecurityConfig#jwtDecoder} (SEC-F08 + the authentication scenarios of
 * docs/security/SECURITY-TEST-PLAN.md): only an HS256 token signed with our key, from our issuer, for our
 * audience, with an expiry in the future is accepted.
 */
class JwtValidationTest {

    private final SecurityConfig config = new SecurityConfig();
    private final AppProperties props = SecurityTestSupport.props();
    private final SecretKey key = config.jwtSigningKey(props);
    private final JwtEncoder encoder = config.jwtEncoder(key);
    private final JwtDecoder decoder = config.jwtDecoder(key, props);

    private String token(JwtEncoder signer, UnaryOperator<JwtClaimsSet.Builder> customize) {
        Instant now = Instant.now();
        JwtClaimsSet.Builder claims = JwtClaimsSet.builder()
                .issuer(SecurityTestSupport.ISSUER)
                .audience(List.of(SecurityTestSupport.AUDIENCE))
                .subject("00000000-0000-0000-0000-000000000001")
                .issuedAt(now)
                .expiresAt(now.plus(Duration.ofMinutes(15)))
                .claim("role", "SOLICITANTE");
        JwtClaimsSet set = customize.apply(claims).build();
        return signer.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), set)).getTokenValue();
    }

    private String token(UnaryOperator<JwtClaimsSet.Builder> customize) {
        return token(encoder, customize);
    }

    @Test
    void acceptsAValidToken() {
        var jwt = decoder.decode(token(c -> c));
        assertThat(jwt.getAudience()).containsExactly(SecurityTestSupport.AUDIENCE);
        assertThat(jwt.getSubject()).isEqualTo("00000000-0000-0000-0000-000000000001");
    }

    @Test
    void rejectsAWrongIssuer() {
        assertThatThrownBy(() -> decoder.decode(token(c -> c.issuer("someone-else")))).isInstanceOf(JwtException.class);
    }

    @Test
    void rejectsAWrongOrMissingAudience() {
        assertThatThrownBy(() -> decoder.decode(token(c -> c.audience(List.of("another-api"))))).isInstanceOf(JwtException.class);
        assertThatThrownBy(() -> decoder.decode(token(c -> c.claims(m -> m.remove("aud"))))).isInstanceOf(JwtException.class);
    }

    @Test
    void rejectsAnExpiredToken() {
        Instant past = Instant.now().minus(Duration.ofHours(1));
        assertThatThrownBy(() -> decoder.decode(token(c -> c.issuedAt(past.minusSeconds(900)).expiresAt(past))))
                .isInstanceOf(JwtException.class);
    }

    @Test
    void rejectsATokenWithoutExpiry() {
        assertThatThrownBy(() -> decoder.decode(token(c -> c.claims(m -> m.remove("exp"))))).isInstanceOf(JwtException.class);
    }

    @Test
    void rejectsATamperedPayload() {
        String[] parts = token(c -> c).split("\\.");
        String forgedPayload = base64Url("{\"sub\":\"00000000-0000-0000-0000-000000000001\",\"role\":\"ADMIN\",\"iss\":\""
                + SecurityTestSupport.ISSUER + "\",\"aud\":[\"" + SecurityTestSupport.AUDIENCE + "\"],\"exp\":4102444800}");
        assertThatThrownBy(() -> decoder.decode(parts[0] + "." + forgedPayload + "." + parts[2])).isInstanceOf(JwtException.class);
    }

    @Test
    void rejectsATokenSignedWithAnotherKey() {
        var otherKey = config.jwtSigningKey(SecurityTestSupport.props("another-secret-that-is-also-32-bytes-long!",
                5, 50, Duration.ofMinutes(15)));
        assertThatThrownBy(() -> decoder.decode(token(config.jwtEncoder(otherKey), c -> c))).isInstanceOf(JwtException.class);
    }

    @Test
    void rejectsTheNoneAlgorithm() {
        String header = base64Url("{\"alg\":\"none\",\"typ\":\"JWT\"}");
        String payload = base64Url("{\"sub\":\"x\",\"iss\":\"" + SecurityTestSupport.ISSUER + "\",\"aud\":[\""
                + SecurityTestSupport.AUDIENCE + "\"],\"exp\":4102444800}");
        assertThatThrownBy(() -> decoder.decode(header + "." + payload + ".")).isInstanceOf(JwtException.class);
    }

    @Test
    void refusesToStartWithAShortSecret() {
        assertThatThrownBy(() -> config.jwtSigningKey(SecurityTestSupport.props("too-short", 5, 50, Duration.ofMinutes(15))))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void refusesToStartWithTheDocumentedPlaceholderSecret() {
        assertThatThrownBy(() -> config.jwtSigningKey(SecurityTestSupport.props(
                "replace-with-a-random-secret-of-at-least-32-bytes", 5, 50, Duration.ofMinutes(15))))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("placeholder");
    }

    private static String base64Url(String json) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(json.getBytes(StandardCharsets.UTF_8));
    }
}
