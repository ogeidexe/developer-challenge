package com.example.purchase.config;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.util.unit.DataSize;
import org.springframework.validation.annotation.Validated;

import java.time.Duration;

/** Typed, validated `app.*` settings (application.yml). The app refuses to start without JWT_SECRET. */
@Validated
@ConfigurationProperties(prefix = "app")
public record AppProperties(@Valid @NotNull Jwt jwt, @Valid @NotNull Idempotency idempotency, @Valid @NotNull Seed seed,
                            @Valid @NotNull Security security) {

    /** {@code audience} is issued as {@code aud} and required on every incoming token (SEC-F08). */
    public record Jwt(@NotBlank String secret, @NotBlank String issuer, @NotBlank String audience, @NotNull Duration ttl) {}

    public record Idempotency(@NotNull Duration ttl, @NotNull Duration purgeInterval) {}

    public record Seed(boolean enabled) {}

    /** Abuse limits (docs/security/FINDINGS.md SEC-F01, SEC-F03). */
    public record Security(@Valid @NotNull Login login, @NotNull DataSize maxRequestBody) {}

    /** Failed-login throttling: per account (e-mail) and per client address, in a fixed window. */
    public record Login(@Min(1) int maxFailuresPerAccount, @Min(1) int maxFailuresPerClient, @NotNull Duration window) {}
}
