package com.example.purchase.persistence;

import com.example.purchase.domain.Category;
import com.example.purchase.domain.Money;
import jakarta.persistence.*;
import org.hibernate.annotations.Immutable;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/**
 * Frozen snapshot of the working copy at a submission (v1, v2…). {@code @Immutable}: Hibernate never
 * issues an UPDATE for it — and the {@code trg_versions_immutable} trigger rejects one anyway (ADR-011).
 * The cost center is part of the snapshot (A-28): budget consumption charges the VERSION's center in the
 * VERSION's competence month.
 */
@Entity
@Immutable
@Table(name = "request_versions")
public class RequestVersionEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "request_id", nullable = false)
    private UUID requestId;

    @Column(name = "version_number", nullable = false)
    private int versionNumber;

    @Column(nullable = false)
    private String title;

    private String description;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Category category;

    @Column(name = "cost_center_id", nullable = false)
    private UUID costCenterId;

    @Column(name = "needed_by")
    private LocalDate neededBy;

    @Column(name = "total_cents", nullable = false)
    private long totalCents;

    @Column(name = "competence_month", nullable = false, columnDefinition = "char(7)")
    private String competenceMonth;

    @Column(name = "submitted_by", nullable = false)
    private UUID submittedBy;

    @Column(name = "submitted_at", nullable = false)
    private Instant submittedAt;

    protected RequestVersionEntity() {}

    public RequestVersionEntity(PurchaseRequestEntity request, int versionNumber, Money total,
                                String competenceMonth, UUID submittedBy, Instant submittedAt) {
        this.requestId = request.getId();
        this.versionNumber = versionNumber;
        this.title = request.getTitle();
        this.description = request.getDescription();
        this.category = request.getCategory();
        this.costCenterId = request.getCostCenterId();
        this.neededBy = request.getNeededBy();
        this.totalCents = total.cents();
        this.competenceMonth = competenceMonth;
        this.submittedBy = submittedBy;
        this.submittedAt = submittedAt;
    }

    public UUID getId() { return id; }
    public UUID getRequestId() { return requestId; }
    public int getVersionNumber() { return versionNumber; }
    public String getTitle() { return title; }
    public String getDescription() { return description; }
    public Category getCategory() { return category; }
    public UUID getCostCenterId() { return costCenterId; }
    public LocalDate getNeededBy() { return neededBy; }
    public Money getTotal() { return Money.ofCents(totalCents); }
    public String getCompetenceMonth() { return competenceMonth; }
    public UUID getSubmittedBy() { return submittedBy; }
    public Instant getSubmittedAt() { return submittedAt; }
}
