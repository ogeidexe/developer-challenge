package com.example.purchase.application;

import com.example.purchase.api.dto.RequestDtos.BudgetLine;
import com.example.purchase.api.dto.RequestDtos.DashboardSummary;
import com.example.purchase.api.dto.RequestDtos.StatusCount;
import com.example.purchase.domain.*;
import com.example.purchase.persistence.*;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * GET /dashboard/summary (README §2.6 + the §6 average-approval-time differentiator).
 * The three aggregations are independent read-only queries, so they run in parallel on virtual threads;
 * each repository call runs in its own short read transaction (this service is deliberately not transactional).
 */
@Service
public class DashboardService {

    private final PurchaseRequestRepository requests;
    private final BudgetRepository budgets;
    private final CostCenterRepository centers;
    private final RequestEventRepository events;
    private final BusinessCalendar calendar;

    public DashboardService(PurchaseRequestRepository requests, BudgetRepository budgets, CostCenterRepository centers,
                            RequestEventRepository events, BusinessCalendar calendar) {
        this.requests = requests;
        this.budgets = budgets;
        this.centers = centers;
        this.events = events;
        this.calendar = calendar;
    }

    public DashboardSummary summary(Actor actor) {
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            Future<List<StatusCount>> totals = executor.submit(() -> totals(actor));
            Future<List<BudgetLine>> budgetLines = executor.submit(() -> budgets(actor));
            Future<Double> averageDays = executor.submit(() -> averageApprovalDays(actor));
            return new DashboardSummary(totals.get(), budgetLines.get(), averageDays.get());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Dashboard interrupted", e);
        } catch (ExecutionException e) {
            if (e.getCause() instanceof RuntimeException runtime) throw runtime;
            throw new IllegalStateException(e.getCause());
        }
    }

    /** Counts per status within the caller's visibility — the same predicate as the list (drafts: owner only). */
    List<StatusCount> totals(Actor actor) {
        var visible = RequestSpecifications.visibleTo(actor);
        return Arrays.stream(RequestStatus.values())
                .map(status -> new StatusCount(status, requests.count(visible.and(RequestSpecifications.hasStatus(status)))))
                .toList();
    }

    /** Current business month: ADMIN sees every center; everyone else their own (A-12). Missing month = zeros. */
    List<BudgetLine> budgets(Actor actor) {
        String month = calendar.currentMonth();
        List<CostCenterEntity> scope = actor.isAdmin()
                ? centers.findAllByOrderByCodeAsc()
                : centers.findAllById(actor.costCenterId() == null ? List.of() : List.of(actor.costCenterId()));
        Map<UUID, BudgetEntity> byCenter = budgets
                .findByYearMonthAndCostCenterIdIn(month, scope.stream().map(CostCenterEntity::getId).toList())
                .stream().collect(Collectors.toMap(BudgetEntity::getCostCenterId, Function.identity()));
        return scope.stream().map(c -> {
            BudgetEntity b = byCenter.get(c.getId());
            Money amount = b == null ? Money.ZERO : b.getAmount();
            Money consumed = b == null ? Money.ZERO : b.getConsumed();
            return new BudgetLine(c.getId(), c.getCode(), c.getName(), month, amount.toDecimalString(),
                    consumed.toDecimalString(), amount.minus(consumed).toDecimalString());
        }).toList();
    }

    /** Mean days from the FIRST submission to the final decision, for decisions in the last 30 days (A-29). */
    Double averageApprovalDays(Actor actor) {
        Instant cutoff = calendar.now().minus(Duration.ofDays(30));
        Specification<PurchaseRequestEntity> decidedRecently = (root, query, cb) -> cb.and(
                root.get("status").in(RequestStatus.APPROVED, RequestStatus.REJECTED),
                cb.greaterThanOrEqualTo(root.<Instant>get("decidedAt"), cutoff));
        List<PurchaseRequestEntity> decided = requests.findAll(RequestSpecifications.visibleTo(actor).and(decidedRecently));
        if (decided.isEmpty()) return null;

        Map<UUID, Instant> firstSubmission = events.findFirstSubmissions(decided.stream().map(PurchaseRequestEntity::getId).toList())
                .stream().collect(Collectors.toMap(RequestEventRepository.FirstSubmission::getRequestId,
                        RequestEventRepository.FirstSubmission::getFirstSubmittedAt));
        double average = decided.stream()
                .filter(r -> firstSubmission.containsKey(r.getId()))
                .mapToDouble(r -> Duration.between(firstSubmission.get(r.getId()), r.getDecidedAt()).toMinutes() / 1440.0)
                .average().orElse(Double.NaN);
        return Double.isNaN(average) ? null : Math.round(average * 10) / 10.0;
    }
}
