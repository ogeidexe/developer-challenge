package com.example.purchase.persistence;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface CostCenterRepository extends JpaRepository<CostCenterEntity, UUID> {

    boolean existsByCodeIgnoreCase(String code);

    List<CostCenterEntity> findAllByOrderByCodeAsc();
}
