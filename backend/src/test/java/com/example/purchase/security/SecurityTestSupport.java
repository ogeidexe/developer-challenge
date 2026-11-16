package com.example.purchase.security;

import com.example.purchase.config.AppProperties;
import org.springframework.util.unit.DataSize;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;

/** Plain-Java fixtures for the security unit tests (no Spring context). */
final class SecurityTestSupport {

    static final String SECRET = "unit-test-secret-that-is-at-least-32-bytes";
    static final String ISSUER = "purchase-requests";
    static final String AUDIENCE = "purchase-requests-api";

    private SecurityTestSupport() {}

    static AppProperties props(String secret, int maxPerAccount, int maxPerClient, Duration window) {
        return new AppProperties(
                new AppProperties.Jwt(secret, ISSUER, AUDIENCE, Duration.ofMinutes(15)),
                new AppProperties.Idempotency(Duration.ofHours(24), Duration.ofHours(1)),
                new AppProperties.Seed(false),
                new AppProperties.Security(new AppProperties.Login(maxPerAccount, maxPerClient, window), DataSize.ofMegabytes(1)));
    }

    static AppProperties props() {
        return props(SECRET, 5, 50, Duration.ofMinutes(15));
    }

    /** A clock the test moves by hand. */
    static final class MutableClock extends Clock {
        private Instant now;

        MutableClock(Instant start) { this.now = start; }

        void advance(Duration d) { now = now.plus(d); }

        @Override public ZoneId getZone() { return ZoneOffset.UTC; }

        @Override public Clock withZone(ZoneId zone) { return this; }

        @Override public Instant instant() { return now; }
    }
}
