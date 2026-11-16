package com.example.purchase.persistence;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface VersionItemRepository extends JpaRepository<VersionItemEntity, UUID> {

    List<VersionItemEntity> findByVersionIdOrderByPositionAsc(UUID versionId);
}
