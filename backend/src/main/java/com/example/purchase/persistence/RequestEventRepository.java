package com.example.purchase.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface RequestEventRepository extends JpaRepository<RequestEventEntity, Long> {

    List<RequestEventEntity> findByRequestIdOrderByOccurredAtAscIdAsc(UUID requestId);

    /** First submission instant per request — for the average approval time (A-29). */
    @Query("""
            select e.requestId as requestId, min(e.occurredAt) as firstSubmittedAt
              from RequestEventEntity e
             where e.requestId in :requestIds and e.action in ('SUBMITTED', 'RESUBMITTED')
             group by e.requestId
            """)
    List<FirstSubmission> findFirstSubmissions(@Param("requestIds") Collection<UUID> requestIds);

    /** Interface-based projection of the query above. */
    interface FirstSubmission {
        UUID getRequestId();

        Instant getFirstSubmittedAt();
    }
}
