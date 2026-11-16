package com.example.purchase.application;

import com.example.purchase.api.dto.AdminDtos.BudgetDto;
import com.example.purchase.api.dto.AdminDtos.CostCenterDto;
import com.example.purchase.api.dto.AdminDtos.CreateCostCenterInput;
import com.example.purchase.domain.*;
import com.example.purchase.persistence.BudgetEntity;
import com.example.purchase.persistence.BudgetRepository;
import com.example.purchase.persistence.CostCenterEntity;
import com.example.purchase.persistence.CostCenterRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
public class CostCenterService {

    private final CostCenterRepository centers;
    private final BudgetRepository budgets;

    public CostCenterService(CostCenterRepository centers, BudgetRepository budgets) {
        this.centers = centers;
        this.budgets = budgets;
    }

    @Transactional(readOnly = true)
    public List<CostCenterDto> list() {
        return centers.findAllByOrderByCodeAsc().stream().map(UserMapping::toDto).toList();
    }

    @Transactional
    public CostCenterDto create(Actor actor, CreateCostCenterInput in) {
        RequestAccess.requireAdmin(actor, "criar centros de custo");
        String code = in.code().strip().toUpperCase();
        if (centers.existsByCodeIgnoreCase(code)) {
            throw new DomainException.Conflict(ErrorCode.CODE_ALREADY_USED, "O código '%s' já está em uso.".formatted(code), null);
        }
        return UserMapping.toDto(centers.save(new CostCenterEntity(code, in.name().strip())));
    }

    /** A month without a budget reads as zero (README §2.3 rule 5) — it is never auto-created by a read. */
    @Transactional(readOnly = true)
    public BudgetDto getBudget(UUID costCenterId, String yearMonth) {
        requireCenterAndMonth(costCenterId, yearMonth);
        return budgets.findByCostCenterIdAndYearMonth(costCenterId, yearMonth)
                .map(CostCenterService::toDto)
                .orElse(new BudgetDto(costCenterId, yearMonth, "0.00", "0.00", "0.00"));
    }

    /**
     * Upsert under a pessimistic row lock: a concurrent final approval cannot consume between our
     * "amount ≥ consumed" check and the write (CT-06). Below consumed → 422 BUDGET_BELOW_CONSUMED.
     */
    @Transactional
    public BudgetDto setBudget(Actor actor, UUID costCenterId, String yearMonth, Money amount) {
        RequestAccess.requireAdmin(actor, "definir orçamentos");
        requireCenterAndMonth(costCenterId, yearMonth);
        var budget = budgets.lockByCostCenterAndMonth(costCenterId, yearMonth).orElse(null);
        if (budget == null) {
            return toDto(budgets.save(new BudgetEntity(costCenterId, yearMonth, amount)));
        }
        if (budget.getConsumed().isGreaterThan(amount)) {
            throw new DomainException.RuleViolation(ErrorCode.BUDGET_BELOW_CONSUMED,
                    "Não é possível definir %s para %s: já foram consumidos %s neste mês."
                            .formatted(amount.toBrl(), yearMonth, budget.getConsumed().toBrl()));
        }
        budget.setAmount(amount);
        return toDto(budget);
    }

    private void requireCenterAndMonth(UUID costCenterId, String yearMonth) {
        if (!BusinessCalendar.isValidYearMonth(yearMonth)) {
            throw new DomainException.Invalid(ErrorCode.INVALID_MONTH_FORMAT,
                    "O mês deve estar no formato yyyy-mm; recebido '%s'.".formatted(yearMonth), List.of());
        }
        if (!centers.existsById(costCenterId)) throw new DomainException.NotFound("Centro de custo não encontrado.");
    }

    private static BudgetDto toDto(BudgetEntity b) {
        return new BudgetDto(b.getCostCenterId(), b.getYearMonth(), b.getAmount().toDecimalString(),
                b.getConsumed().toDecimalString(), b.getAvailable().toDecimalString());
    }
}
