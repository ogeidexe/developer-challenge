package com.example.purchase.persistence;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface RequestVersionRepository extends JpaRepository<RequestVersionEntity, UUID> {

    List<RequestVersionEntity> findByRequestIdOrderByVersionNumberAsc(UUID requestId);

    Optional<RequestVersionEntity> findByRequestIdAndVersionNumber(UUID requestId, int versionNumber);
}
