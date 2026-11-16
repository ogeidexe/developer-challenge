package com.example.purchase.security;

import com.example.purchase.config.AppProperties;
import com.nimbusds.jose.jwk.source.ImmutableSecret;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimNames;
import org.springframework.security.oauth2.jwt.JwtClaimValidator;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.security.web.SecurityFilterChain;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;

/**
 * Stateless JWT authentication (HS256) via the OAuth2 resource server. The filter chain only answers
 * "authenticated or not" (401). Role, ownership and business authorization run inside the services, after
 * the visibility check — README §4.3 orders 404 before 403, which a URL-level role rule could not honour.
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    SecurityFilterChain api(HttpSecurity http, ProblemResponses problems) throws Exception {
        return http
                .csrf(AbstractHttpConfigurer::disable) // bearer tokens, no cookies → no CSRF surface
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(HttpMethod.POST, "/auth/register", "/auth/login").permitAll()
                        // the public sign-up form needs the list of cost centers
                        .requestMatchers(HttpMethod.GET, "/health", "/health/**", "/cost-centers").permitAll()
                        .requestMatchers("/docs", "/docs/**", "/v3/api-docs", "/v3/api-docs/**", "/swagger-ui/**", "/error").permitAll()
                        .anyRequest().authenticated())
                .oauth2ResourceServer(oauth -> oauth
                        .jwt(Customizer.withDefaults())
                        .authenticationEntryPoint(problems::unauthorized))
                .exceptionHandling(e -> e
                        .authenticationEntryPoint(problems::unauthorized)
                        .accessDeniedHandler(problems::forbidden))
                .build();
    }

    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(); // README §2.1: strong hash
    }

    /**
     * Placeholders that have appeared in this repository's examples. Long enough to pass the length check, but
     * public: a server started with one would accept tokens forged by anyone (SEC-F13).
     */
    static final Set<String> KNOWN_PLACEHOLDER_SECRETS = Set.of(
            "replace-with-a-random-secret-of-at-least-32-bytes",
            "change-me-to-a-random-secret-of-at-least-32-bytes",
            "changeme", "change-me", "secret");

    /** HS256 needs a ≥ 256-bit key: refuse to start with a weak or public secret instead of signing weak tokens. */
    @Bean
    SecretKey jwtSigningKey(AppProperties props) {
        if (KNOWN_PLACEHOLDER_SECRETS.contains(props.jwt().secret().strip().toLowerCase(Locale.ROOT))) {
            throw new IllegalStateException("JWT_SECRET is a documented placeholder; generate a random one (openssl rand -base64 48)");
        }
        byte[] secret = props.jwt().secret().getBytes(StandardCharsets.UTF_8);
        if (secret.length < 32) {
            throw new IllegalStateException("JWT_SECRET must be at least 32 bytes (got " + secret.length + ")");
        }
        return new SecretKeySpec(secret, "HmacSHA256");
    }

    @Bean
    JwtEncoder jwtEncoder(SecretKey jwtSigningKey) {
        return new NimbusJwtEncoder(new ImmutableSecret<>(jwtSigningKey));
    }

    /**
     * Signature pinned to HS256 (no "none"/algorithm confusion) and claims validated: exp/nbf (with the default
     * 60 s skew), iss, and — SEC-F08 — aud must contain our audience and exp must be present (the default
     * timestamp validator accepts a token without exp).
     */
    @Bean
    JwtDecoder jwtDecoder(SecretKey jwtSigningKey, AppProperties props) {
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withSecretKey(jwtSigningKey).macAlgorithm(MacAlgorithm.HS256).build();
        decoder.setJwtValidator(tokenValidator(props.jwt()));
        return decoder;
    }

    static OAuth2TokenValidator<Jwt> tokenValidator(AppProperties.Jwt jwt) {
        String audience = jwt.audience();
        return new DelegatingOAuth2TokenValidator<>(
                JwtValidators.createDefaultWithIssuer(jwt.issuer()),
                new JwtClaimValidator<List<String>>(JwtClaimNames.AUD, aud -> aud != null && aud.contains(audience)),
                new JwtClaimValidator<Instant>(JwtClaimNames.EXP, Objects::nonNull));
    }
}
