package com.example.purchase.security;

import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.UUID;

/**
 * Server-side sessions in Redis (ADR-015). Every issued JWT carries a session id (`jti`); the session lives in
 * Redis as {@code session:<jti> → userId} with the token's TTL. A token whose session is gone (logout, expiry,
 * Redis flushed) is rejected with 401 even if its signature and `exp` are still valid — this is what makes
 * logout and revocation real for an otherwise stateless JWT.
 */
@Component
public class SessionStore {

    static final String KEY_PREFIX = "session:";

    private final StringRedisTemplate redis;

    public SessionStore(StringRedisTemplate redis) {
        this.redis = redis;
    }

    /** Opens the session of a freshly issued token; it expires together with the token. */
    public void open(String sessionId, UUID userId, Duration ttl) {
        redis.opsForValue().set(KEY_PREFIX + sessionId, userId.toString(), ttl);
    }

    public boolean isOpen(String sessionId) {
        return sessionId != null && Boolean.TRUE.equals(redis.hasKey(KEY_PREFIX + sessionId));
    }

    /** Logout: the token stops working immediately. Idempotent. */
    public void close(String sessionId) {
        if (sessionId != null) redis.delete(KEY_PREFIX + sessionId);
    }

    /** Remaining lifetime of a session (for tests and diagnostics); null when it does not exist. */
    public Duration remaining(String sessionId) {
        Long seconds = redis.getExpire(KEY_PREFIX + sessionId);
        return seconds == null || seconds < 0 ? null : Duration.ofSeconds(seconds);
    }

    /** JWT validator: the token's session must still be open. Fails closed if Redis cannot be reached. */
    public OAuth2TokenValidator<Jwt> validator() {
        return jwt -> isOpen(jwt.getId())
                ? OAuth2TokenValidatorResult.success()
                : OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token", "Sessão encerrada ou expirada.", null));
    }
}
