package com.example.purchase.persistence;

import com.example.purchase.domain.RequestStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PurchaseRequestRepository
        extends JpaRepository<PurchaseRequestEntity, UUID>, JpaSpecificationExecutor<PurchaseRequestEntity> {

    /**
     * Optimistic lock as the FIRST write of every transition (ADR-009, TRANSACTION-STRATEGY §3.1).
     * Under READ COMMITTED a competing transaction waits on the row lock, re-evaluates the WHERE on the
     * committed row and gets 0 rows → 409. That is what makes "two approvals of the same step → exactly one
     * succeeds, the other gets 409" hold even on a final step with an almost empty budget.
     * Clears the persistence context so the caller re-reads the (now locked) row.
     *
     * @return 1 when the caller now owns the row, 0 when {@code expected} is stale
     */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update PurchaseRequestEntity r
               set r.lockVersion = r.lockVersion + 1, r.updatedAt = :now
             where r.id = :id and r.lockVersion = :expected
            """)
    int claim(@Param("id") UUID id, @Param("expected") int expected, @Param("now") Instant now);

    @Query("select r.lockVersion from PurchaseRequestEntity r where r.id = :id")
    Optional<Integer> findLockVersion(@Param("id") UUID id);

    @Query(value = "select nextval('sq_request_number')", nativeQuery = true)
    long nextRequestNumber();

    List<PurchaseRequestEntity> findByStatus(RequestStatus status);

    List<PurchaseRequestEntity> findByStatusAndCostCenterId(RequestStatus status, UUID costCenterId);
}
