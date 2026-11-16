package com.example.purchase.persistence;

import com.example.purchase.domain.StepLevel;
import com.example.purchase.domain.StepState;
import com.example.purchase.domain.StepStatus;
import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

/** One step of a version's chain. Decided only through the status-conditional UPDATEs in the repository. */
@Entity
@Table(name = "approval_steps")
public class ApprovalStepEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "version_id", nullable = false)
    private UUID versionId;

    @Column(nullable = false)
    private int sequence;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private StepLevel level;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private StepStatus status = StepStatus.PENDING;

    @Column(name = "approver_id")
    private UUID approverId;

    @Column(name = "decided_at")
    private Instant decidedAt;

    private String comment;

    protected ApprovalStepEntity() {}

    public ApprovalStepEntity(UUID versionId, int sequence, StepLevel level) {
        this.versionId = versionId;
        this.sequence = sequence;
        this.level = level;
    }

    public StepState toState() { return new StepState(sequence, level, status, approverId); }

    public UUID getId() { return id; }
    public UUID getVersionId() { return versionId; }
    public int getSequence() { return sequence; }
    public StepLevel getLevel() { return level; }
    public StepStatus getStatus() { return status; }
    public UUID getApproverId() { return approverId; }
    public Instant getDecidedAt() { return decidedAt; }
    public String getComment() { return comment; }
}
