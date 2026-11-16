package com.example.purchase.security;

import com.example.purchase.config.AppProperties;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Failed-login throttling (SEC-F01, CWE-307). Two fixed-window counters per attempt: one per account (the
 * normalized e-mail, stops password guessing on one user) and one per client address (stops spraying many
 * accounts from one host). While either counter is at its limit, every login for that key is refused with
 * 429 — even with the right password, otherwise guessing could simply continue. A successful login clears
 * the account counter only.
 *
 * <p>In-memory and per instance: enough for the single-node deployment of this project. Several instances
 * would need a shared store (e.g. a table or Redis) — see docs/security/RISK-REGISTER.md.
 */
@Component
public class LoginAttemptLimiter {

    /** Above this many tracked keys, expired windows are evicted before a new failure is recorded. */
    static final int EVICTION_THRESHOLD = 10_000;

    private record Window(Instant start, int failures) {}

    private final ConcurrentHashMap<String, Window> windows = new ConcurrentHashMap<>();
    private final Clock clock;
    private final AppProperties.Login limits;

    public LoginAttemptLimiter(Clock clock, AppProperties props) {
        this.clock = clock;
        this.limits = props.security().login();
    }

    /** @throws LoginThrottledException when the account or the client is currently blocked */
    public void checkAllowed(String email, String clientAddress) {
        Instant now = clock.instant();
        long wait = Math.max(secondsBlocked(accountKey(email), limits.maxFailuresPerAccount(), now),
                secondsBlocked(clientKey(clientAddress), limits.maxFailuresPerClient(), now));
        if (wait > 0) throw new LoginThrottledException(wait);
    }

    public void recordFailure(String email, String clientAddress) {
        Instant now = clock.instant();
        if (windows.size() > EVICTION_THRESHOLD) evictExpired(now);
        increment(accountKey(email), now);
        increment(clientKey(clientAddress), now);
    }

    public void recordSuccess(String email) {
        windows.remove(accountKey(email));
    }

    int trackedKeys() {
        return windows.size();
    }

    private void increment(String key, Instant now) {
        windows.compute(key, (k, w) -> w == null || expired(w, now) ? new Window(now, 1) : new Window(w.start(), w.failures() + 1));
    }

    private long secondsBlocked(String key, int maxFailures, Instant now) {
        Window w = windows.get(key);
        if (w == null || expired(w, now) || w.failures() < maxFailures) return 0;
        return Math.max(1, Duration.between(now, w.start().plus(limits.window())).toSeconds());
    }

    private boolean expired(Window w, Instant now) {
        return !now.isBefore(w.start().plus(limits.window()));
    }

    private void evictExpired(Instant now) {
        windows.entrySet().removeIf(e -> expired(e.getValue(), now));
    }

    private static String accountKey(String email) {
        return "account:" + (email == null ? "" : email.strip().toLowerCase(Locale.ROOT));
    }

    private static String clientKey(String clientAddress) {
        return "client:" + (clientAddress == null ? "unknown" : clientAddress);
    }

    /** Mapped to 429 + {@code Retry-After} by the GlobalExceptionHandler. */
    public static final class LoginThrottledException extends RuntimeException {

        private final long retryAfterSeconds;

        public LoginThrottledException(long retryAfterSeconds) {
            super("Muitas tentativas de login. Tente novamente em " + retryAfterSeconds + " s.", null, false, false);
            this.retryAfterSeconds = retryAfterSeconds;
        }

        public long retryAfterSeconds() {
            return retryAfterSeconds;
        }
    }
}
