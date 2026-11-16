package com.example.purchase.application;

import com.example.purchase.api.dto.RequestDtos.RequestDetail;
import com.example.purchase.api.dto.RequestDtos.RequestInput;
import com.example.purchase.config.AppProperties;
import com.example.purchase.domain.Actor;
import com.example.purchase.domain.DomainException;
import com.example.purchase.domain.ErrorCode;
import com.example.purchase.domain.Money;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * {@code POST /requests} with {@code Idempotency-Key} (README §3.2, ADR-010, A-32): same user + same key +
 * same payload → the SAME stored response, no second request; same key + different payload → 409.
 *
 * <p>The key is reserved in the same transaction as the create, with {@code INSERT … ON CONFLICT … RETURNING}:
 * a racing duplicate waits on the primary key and then gets 0 rows — a row count, not an error, because an
 * error would abort the PostgreSQL transaction. The request row and the key row commit atomically.
 */
@Service
public class IdempotencyService {

    private static final String ENDPOINT = "POST /requests";

    private final JdbcClient jdbc;
    private final TransactionTemplate tx;
    private final PurchaseRequestService requests;
    private final JsonMapper json;
    private final AppProperties props;

    public IdempotencyService(JdbcClient jdbc, TransactionTemplate tx, PurchaseRequestService requests,
                              JsonMapper json, AppProperties props) {
        this.jdbc = jdbc;
        this.tx = tx;
        this.requests = requests;
        this.json = json;
        this.props = props;
    }

    /** {@code body} is a {@link RequestDetail} for a fresh create, or the stored raw JSON for a replay. */
    public record Outcome(int status, Object body, boolean replayed) {}

    private record Stored(String payloadHash, int status, String body, boolean expired) {}

    /** Signals "a concurrent request already owns this key" — thrown inside the transaction to roll it back. */
    private static final class KeyTaken extends RuntimeException {
        KeyTaken() { super(null, null, false, false); }
    }

    public Outcome create(Actor actor, String key, RequestInput in) {
        if (key == null || key.isBlank()) {
            return new Outcome(201, requests.create(actor, in), false); // no header → no dedup
        }
        if (key.length() > 255) throw DomainException.Invalid.field("Idempotency-Key", "No máximo 255 caracteres.");
        String hash = hash(in);

        Optional<Stored> live = find(actor.id(), key).filter(s -> !s.expired()); // expired = absent
        if (live.isPresent()) return replayOrConflict(live.get(), hash);

        try {
            return tx.execute(status -> {
                if (reserve(actor.id(), key, hash).isEmpty()) throw new KeyTaken();
                RequestDetail created = requests.create(actor, in); // joins this transaction
                jdbc.sql("""
                        UPDATE idempotency_keys
                           SET response_status = 201, response_body = CAST(:body AS jsonb)
                         WHERE user_id = :userId AND idem_key = :key
                        """)
                        .param("body", json.writeValueAsString(created))
                        .param("userId", actor.id())
                        .param("key", key)
                        .update();
                return new Outcome(201, created, false);
            });
        } catch (KeyTaken raced) {
            // our transaction rolled back; the winner has committed — answer exactly like a retry would
            return replayOrConflict(find(actor.id(), key).orElseThrow(), hash);
        }
    }

    /** Lazy cleanup, called by {@link IdempotencyPurgeJob}. */
    public int purgeExpired() {
        return jdbc.sql("DELETE FROM idempotency_keys WHERE expires_at < now()").update();
    }

    // ---------- SQL ----------

    private Optional<UUID> reserve(UUID userId, String key, String hash) {
        return jdbc.sql("""
                INSERT INTO idempotency_keys (user_id, idem_key, endpoint, payload_hash, response_status, response_body, created_at, expires_at)
                VALUES (:userId, :key, :endpoint, :hash, 102, CAST('{}' AS jsonb), now(), now() + make_interval(secs => :ttl))
                ON CONFLICT (user_id, idem_key) DO UPDATE
                   SET payload_hash = EXCLUDED.payload_hash, response_status = EXCLUDED.response_status,
                       response_body = EXCLUDED.response_body, created_at = EXCLUDED.created_at, expires_at = EXCLUDED.expires_at
                 WHERE idempotency_keys.expires_at < now()
                RETURNING user_id
                """)
                .param("userId", userId)
                .param("key", key)
                .param("endpoint", ENDPOINT)
                .param("hash", hash)
                .param("ttl", (double) props.idempotency().ttl().toSeconds())
                .query(UUID.class)
                .optional();
    }

    private Optional<Stored> find(UUID userId, String key) {
        return jdbc.sql("""
                SELECT payload_hash, response_status, CAST(response_body AS text) AS body, expires_at < now() AS expired
                  FROM idempotency_keys
                 WHERE user_id = :userId AND idem_key = :key
                """)
                .param("userId", userId)
                .param("key", key)
                .query((rs, row) -> new Stored(rs.getString("payload_hash").strip(), rs.getInt("response_status"),
                        rs.getString("body"), rs.getBoolean("expired")))
                .optional();
    }

    private static Outcome replayOrConflict(Stored stored, String hash) {
        if (!stored.payloadHash().equals(hash)) {
            throw new DomainException.Conflict(ErrorCode.IDEMPOTENCY_PAYLOAD_MISMATCH,
                    "Esta Idempotency-Key já foi usada com um conteúdo diferente. Gere uma nova chave para uma nova solicitação.", null);
        }
        return new Outcome(stored.status(), stored.body(), true);
    }

    /**
     * SHA-256 of a canonical form of the payload: field order fixed by this method, text trimmed, prices
     * normalized to cents ("10" and "10.00" are the same payload).
     */
    static String hash(RequestInput in) {
        String items = in.items().stream()
                .map(i -> String.join("\u001e", i.description().strip(), String.valueOf(i.quantity()),
                        Money.isValid(i.unitPrice()) ? String.valueOf(Money.parse(i.unitPrice()).cents()) : i.unitPrice()))
                .collect(Collectors.joining("\u001d"));
        String canonical = String.join("\u001f", in.title().strip(),
                Objects.toString(in.description() == null ? null : in.description().strip()),
                in.category().name(), Objects.toString(in.costCenterId()), Objects.toString(in.neededBy()), items);
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(canonical.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is required by every JRE", e);
        }
    }
}
