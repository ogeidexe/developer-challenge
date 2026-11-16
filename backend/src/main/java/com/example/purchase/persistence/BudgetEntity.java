package com.example.purchase.persistence;

import com.example.purchase.domain.Money;
import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.Instant;
import java.util.UUID;

/**
 * Monthly budget. {@code consumed_cents} is written ONLY by the atomic conditional UPDATE in
 * {@link BudgetRepository#consume}; this entity changes {@code amount_cents} (admin PUT) under a row lock.
 */
@Entity
@Table(name = "budgets")
public class BudgetEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "cost_center_id", nullable = false)
    private UUID costCenterId;

    @Column(name = "year_month", nullable = false, columnDefinition = "char(7)")
    private String yearMonth;

    @Column(name = "amount_cents", nullable = false)
    private long amountCents;

    @Column(name = "consumed_cents", nullable = false)
    private long consumedCents;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected BudgetEntity() {}

    public BudgetEntity(UUID costCenterId, String yearMonth, Money amount) {
        this.costCenterId = costCenterId;
        this.yearMonth = yearMonth;
        this.amountCents = amount.cents();
    }

    public void setAmount(Money amount) { this.amountCents = amount.cents(); }

    public UUID getCostCenterId() { return costCenterId; }
    public String getYearMonth() { return yearMonth; }
    public Money getAmount() { return Money.ofCents(amountCents); }
    public Money getConsumed() { return Money.ofCents(consumedCents); }
    public Money getAvailable() { return Money.ofCents(amountCents - consumedCents); }
}
