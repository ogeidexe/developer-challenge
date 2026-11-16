package com.example.purchase.persistence;

import com.example.purchase.domain.Category;
import com.example.purchase.domain.Money;
import com.example.purchase.domain.RequestStatus;
import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/**
 * Aggregate root. Holds the editable WORKING COPY (title, description, category, cost center, neededBy;
 * items in {@code request_items}); every submit freezes an immutable {@link RequestVersionEntity}
 * (ADR-011). {@code lockVersion} is the optimistic-concurrency token (README §3.2) — it is bumped by
 * {@link PurchaseRequestRepository#claim}, the first write of every transition, never by Hibernate.
 */
@Entity
@Table(name = "purchase_requests")
public class PurchaseRequestEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "request_number", nullable = false, updatable = false)
    private String requestNumber;

    @Column(name = "owner_id", nullable = false, updatable = false)
    private UUID ownerId;

    @Column(name = "cost_center_id", nullable = false)
    private UUID costCenterId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private RequestStatus status = RequestStatus.DRAFT;

    @Column(name = "current_version", nullable = false)
    private int currentVersion;

    /** Read-only for Hibernate: only {@link PurchaseRequestRepository#claim} changes it. */
    @Column(name = "lock_version", nullable = false, insertable = false, updatable = false)
    private int lockVersion = 1;

    @Column(nullable = false)
    private String title;

    private String description;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Category category;

    @Column(name = "needed_by")
    private LocalDate neededBy;

    /** Total of the working copy; equals the current version's total whenever the request is not editable. */
    @Column(name = "total_cents", nullable = false)
    private long totalCents;

    @Column(name = "submitted_at")
    private Instant submittedAt;

    @Column(name = "decided_at")
    private Instant decidedAt;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected PurchaseRequestEntity() {}

    public PurchaseRequestEntity(String requestNumber, UUID ownerId, Instant now) {
        this.requestNumber = requestNumber;
        this.ownerId = ownerId;
        this.updatedAt = now;
    }

    public void updateWorkingCopy(String title, String description, Category category, UUID costCenterId,
                                  LocalDate neededBy, Money total, Instant now) {
        this.title = title;
        this.description = description;
        this.category = category;
        this.costCenterId = costCenterId;
        this.neededBy = neededBy;
        this.totalCents = total.cents();
        this.updatedAt = now;
    }

    public void markSubmitted(int versionNumber, Money versionTotal, Instant now) {
        this.status = RequestStatus.PENDING_APPROVAL;
        this.currentVersion = versionNumber;
        this.totalCents = versionTotal.cents();
        this.submittedAt = now;
        this.updatedAt = now;
    }

    public void moveTo(RequestStatus next, Instant now) {
        this.status = next;
        if (next.isFinal()) this.decidedAt = now;
        this.updatedAt = now;
    }

    public boolean isOwnedBy(UUID userId) { return ownerId.equals(userId); }

    public UUID getId() { return id; }
    public String getRequestNumber() { return requestNumber; }
    public UUID getOwnerId() { return ownerId; }
    public UUID getCostCenterId() { return costCenterId; }
    public RequestStatus getStatus() { return status; }
    public int getCurrentVersion() { return currentVersion; }
    public int getLockVersion() { return lockVersion; }
    public String getTitle() { return title; }
    public String getDescription() { return description; }
    public Category getCategory() { return category; }
    public LocalDate getNeededBy() { return neededBy; }
    public Money getTotal() { return Money.ofCents(totalCents); }
    public Instant getSubmittedAt() { return submittedAt; }
    public Instant getDecidedAt() { return decidedAt; }
    public Instant getCreatedAt() { return createdAt; }
}
