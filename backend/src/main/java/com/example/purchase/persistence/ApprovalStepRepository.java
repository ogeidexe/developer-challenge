package com.example.purchase.persistence;

import com.example.purchase.domain.StepStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface ApprovalStepRepository extends JpaRepository<ApprovalStepEntity, UUID> {

    List<ApprovalStepEntity> findByVersionIdOrderBySequenceAsc(UUID versionId);

    List<ApprovalStepEntity> findByVersionIdInOrderBySequenceAsc(Collection<UUID> versionIds);

    /**
     * Status-conditional decision (TRANSACTION-STRATEGY §3.3): the row itself is the guard.
     * 0 rows → someone decided this step first → 409. Defense in depth behind the aggregate lock.
     */
    @Modifying
    @Query("""
            update ApprovalStepEntity s
               set s.status = :status, s.approverId = :approverId, s.decidedAt = :decidedAt, s.comment = :comment
             where s.id = :id and s.status = :pending
            """)
    int decide(@Param("id") UUID id, @Param("status") StepStatus status, @Param("approverId") UUID approverId,
               @Param("decidedAt") Instant decidedAt, @Param("comment") String comment,
               @Param("pending") StepStatus pending);

    /** A-31: on reject / return / cancel, the steps after the current one were never reached. */
    @Modifying
    @Query("""
            update ApprovalStepEntity s
               set s.status = :skipped
             where s.versionId = :versionId and s.status = :pending and s.sequence > :afterSequence
            """)
    int skipAfter(@Param("versionId") UUID versionId, @Param("afterSequence") int afterSequence,
                  @Param("skipped") StepStatus skipped, @Param("pending") StepStatus pending);
}
