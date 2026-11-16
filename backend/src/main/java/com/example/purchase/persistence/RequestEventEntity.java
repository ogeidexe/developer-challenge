package com.example.purchase.persistence;

import com.example.purchase.domain.RequestStatus;
import com.example.purchase.domain.Role;
import com.example.purchase.domain.StepLevel;
import jakarta.persistence.*;
import org.hibernate.annotations.Immutable;

import java.time.Instant;
import java.util.UUID;

/** Append-only audit event (README §2.5). Never updated or deleted — enforced by the DB trigger too. */
@Entity
@Immutable
@Table(name = "request_events")
public class RequestEventEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "request_id", nullable = false)
    private UUID requestId;

    @Column(name = "actor_id")
    private UUID actorId;

    @Enumerated(EnumType.STRING)
    @Column(name = "actor_role", nullable = false)
    private Role actorRole;

    @Column(nullable = false)
    private String action;

    @Enumerated(EnumType.STRING)
    @Column(name = "from_status")
    private RequestStatus fromStatus;

    @Enumerated(EnumType.STRING)
    @Column(name = "to_status")
    private RequestStatus toStatus;

    @Enumerated(EnumType.STRING)
    @Column(name = "step_level")
    private StepLevel stepLevel;

    @Column(name = "step_sequence")
    private Integer stepSequence;

    @Column(name = "version_number", nullable = false)
    private int versionNumber;

    private String comment;

    @Column(name = "x_request_id", nullable = false)
    private String xRequestId;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt;

    protected RequestEventEntity() {}

    public RequestEventEntity(UUID requestId, UUID actorId, Role actorRole, String action, RequestStatus fromStatus,
                              RequestStatus toStatus, StepLevel stepLevel, Integer stepSequence, int versionNumber,
                              String comment, String xRequestId, Instant occurredAt) {
        this.requestId = requestId;
        this.actorId = actorId;
        this.actorRole = actorRole;
        this.action = action;
        this.fromStatus = fromStatus;
        this.toStatus = toStatus;
        this.stepLevel = stepLevel;
        this.stepSequence = stepSequence;
        this.versionNumber = versionNumber;
        this.comment = comment;
        this.xRequestId = xRequestId;
        this.occurredAt = occurredAt;
    }

    public Long getId() { return id; }
    public UUID getRequestId() { return requestId; }
    public UUID getActorId() { return actorId; }
    public Role getActorRole() { return actorRole; }
    public String getAction() { return action; }
    public RequestStatus getFromStatus() { return fromStatus; }
    public RequestStatus getToStatus() { return toStatus; }
    public StepLevel getStepLevel() { return stepLevel; }
    public Integer getStepSequence() { return stepSequence; }
    public int getVersionNumber() { return versionNumber; }
    public String getComment() { return comment; }
    public String getXRequestId() { return xRequestId; }
    public Instant getOccurredAt() { return occurredAt; }
}
