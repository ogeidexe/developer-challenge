package com.example.purchase.persistence;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface BudgetRepository extends JpaRepository<BudgetEntity, UUID> {

    /**
     * Atomic conditional consumption (TRANSACTION-STRATEGY §3.2). The UPDATE row-locks the budget, so
     * concurrent final approvals on the same center serialize; each re-checks the predicate on the
     * committed value, so the balance can never go negative. A missing month matches no row → zero balance
     * (README §2.3 rule 5). Backstop: CHECK (consumed_cents <= amount_cents).
     *
     * @return 1 when consumed, 0 when the month has no budget or the balance is insufficient
     */
    @Modifying
    @Query(value = """
            UPDATE budgets
               SET consumed_cents = consumed_cents + :amount, updated_at = now()
             WHERE cost_center_id = :costCenterId
               AND year_month = :yearMonth
               AND consumed_cents + :amount <= amount_cents
            """, nativeQuery = true)
    int consume(@Param("costCenterId") UUID costCenterId, @Param("yearMonth") String yearMonth, @Param("amount") long amountCents);

    Optional<BudgetEntity> findByCostCenterIdAndYearMonth(UUID costCenterId, String yearMonth);

    List<BudgetEntity> findByYearMonthAndCostCenterIdIn(String yearMonth, Collection<UUID> costCenterIds);

    /** Pessimistic lock for the admin PUT: the "below consumed" check cannot race a consumption (CT-06). */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select b from BudgetEntity b where b.costCenterId = :costCenterId and b.yearMonth = :yearMonth")
    Optional<BudgetEntity> lockByCostCenterAndMonth(@Param("costCenterId") UUID costCenterId, @Param("yearMonth") String yearMonth);
}
