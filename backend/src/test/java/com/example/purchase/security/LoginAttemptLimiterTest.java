package com.example.purchase.security;

import com.example.purchase.security.LoginAttemptLimiter.LoginThrottledException;
import com.example.purchase.security.SecurityTestSupport.MutableClock;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** SEC-F01 — failed-login throttling, per account and per client. */
class LoginAttemptLimiterTest {

    private final MutableClock clock = new MutableClock(Instant.parse("2026-11-15T12:00:00Z"));
    private final LoginAttemptLimiter limiter =
            new LoginAttemptLimiter(clock, SecurityTestSupport.props(SecurityTestSupport.SECRET, 3, 5, Duration.ofMinutes(15)));

    @Test
    void blocksAnAccountAfterTheLimitAndReportsRetryAfter() {
        for (int i = 0; i < 3; i++) {
            assertThatCode(() -> limiter.checkAllowed("ana@x.test", "10.0.0.1")).doesNotThrowAnyException();
            limiter.recordFailure("ana@x.test", "10.0.0.1");
        }
        assertThatThrownBy(() -> limiter.checkAllowed("ana@x.test", "10.0.0.99")) // another address: still blocked
                .isInstanceOfSatisfying(LoginThrottledException.class,
                        e -> assertThat(e.retryAfterSeconds()).isEqualTo(Duration.ofMinutes(15).toSeconds()));
    }

    @Test
    void accountKeyIsCaseAndWhitespaceInsensitive() {
        limiter.recordFailure("Ana@X.test", "10.0.0.1");
        limiter.recordFailure(" ana@x.test ", "10.0.0.2");
        limiter.recordFailure("ANA@X.TEST", "10.0.0.3");
        assertThatThrownBy(() -> limiter.checkAllowed("ana@x.test", "10.0.0.4")).isInstanceOf(LoginThrottledException.class);
    }

    @Test
    void blocksAClientThatSpraysManyAccounts() {
        for (int i = 0; i < 5; i++) limiter.recordFailure("user" + i + "@x.test", "10.0.0.7");
        assertThatThrownBy(() -> limiter.checkAllowed("fresh@x.test", "10.0.0.7")).isInstanceOf(LoginThrottledException.class);
        assertThatCode(() -> limiter.checkAllowed("fresh@x.test", "10.0.0.8")).doesNotThrowAnyException();
    }

    @Test
    void theWindowExpires() {
        for (int i = 0; i < 3; i++) limiter.recordFailure("ana@x.test", "10.0.0.1");
        clock.advance(Duration.ofMinutes(15));
        assertThatCode(() -> limiter.checkAllowed("ana@x.test", "10.0.0.1")).doesNotThrowAnyException();
    }

    @Test
    void successClearsTheAccountCounter() {
        limiter.recordFailure("ana@x.test", "10.0.0.1");
        limiter.recordFailure("ana@x.test", "10.0.0.1");
        limiter.recordSuccess("ana@x.test");
        limiter.recordFailure("ana@x.test", "10.0.0.1");
        assertThatCode(() -> limiter.checkAllowed("ana@x.test", "10.0.0.1")).doesNotThrowAnyException();
    }

    @Test
    void expiredWindowsAreEvictedSoMemoryStaysBounded() {
        for (int i = 0; i <= LoginAttemptLimiter.EVICTION_THRESHOLD; i++) limiter.recordFailure("u" + i + "@x.test", "10.1.0.1");
        clock.advance(Duration.ofMinutes(16));
        limiter.recordFailure("late@x.test", "10.2.0.1");
        assertThat(limiter.trackedKeys()).isEqualTo(2); // only the new account + client keys survive
    }
}
