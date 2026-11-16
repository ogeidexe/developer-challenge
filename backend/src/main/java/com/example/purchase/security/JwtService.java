package com.example.purchase.security;

import com.example.purchase.config.AppProperties;
import com.example.purchase.persistence.UserEntity;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Short-lived access token (README §2.1: e.g. 15 min) with the minimum claims sub, role, costCenterId and
 * approverLevel (when present). The claims are informational for the client — the server re-loads the user
 * from the database on every request, so a role change takes effect immediately.
 */
@Service
public class JwtService {

    public record IssuedToken(String value, long expiresInSeconds) {}

    private final JwtEncoder encoder;
    private final AppProperties props;
    private final Clock clock;
    private final SessionStore sessions;

    public JwtService(JwtEncoder encoder, AppProperties props, Clock clock, SessionStore sessions) {
        this.encoder = encoder;
        this.props = props;
        this.clock = clock;
        this.sessions = sessions;
    }

    public IssuedToken issue(UserEntity user) {
        Instant now = clock.instant();
        String sessionId = UUID.randomUUID().toString(); // jti = Redis session id (ADR-015)
        var claims = JwtClaimsSet.builder()
                .issuer(props.jwt().issuer())
                .audience(List.of(props.jwt().audience())) // validated by SecurityConfig.jwtDecoder (SEC-F08)
                .subject(user.getId().toString())
                .issuedAt(now)
                .expiresAt(now.plus(props.jwt().ttl()))
                .id(sessionId)
                .claim("role", user.getRole().name())
                .claim("name", user.getName());
        if (user.getCostCenterId() != null) claims.claim("costCenterId", user.getCostCenterId().toString());
        if (user.getApproverLevel() != null) claims.claim("approverLevel", user.getApproverLevel().name());

        var header = JwsHeader.with(MacAlgorithm.HS256).build();
        String token = encoder.encode(JwtEncoderParameters.from(header, claims.build())).getTokenValue();
        sessions.open(sessionId, user.getId(), props.jwt().ttl());
        return new IssuedToken(token, props.jwt().ttl().toSeconds());
    }
}
