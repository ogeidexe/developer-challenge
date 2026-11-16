package com.example.purchase.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface RequestItemRepository extends JpaRepository<RequestItemEntity, UUID> {

    List<RequestItemEntity> findByRequestIdOrderByPositionAsc(UUID requestId);

    /**
     * Bulk delete before re-inserting the working copy. A bulk statement runs immediately, so the new rows
     * cannot collide with the old ones on UNIQUE(request_id, position) — Hibernate's flush order (inserts
     * before deletes) would otherwise break an orphan-removal "clear and re-add".
     */
    @Modifying
    @Query("delete from RequestItemEntity i where i.requestId = :requestId")
    int deleteByRequestId(@Param("requestId") UUID requestId);
}
