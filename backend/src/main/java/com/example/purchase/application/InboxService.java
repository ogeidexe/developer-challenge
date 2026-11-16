package com.example.purchase.application;

import com.example.purchase.api.dto.CommonDtos.PageResponse;
import com.example.purchase.api.dto.RequestDtos.InboxItem;
import com.example.purchase.domain.*;
import com.example.purchase.persistence.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Stream;

/**
 * GET /approvals/inbox (README §2.4): requests whose CURRENT step the caller can decide NOW — cost center,
 * level and segregation already applied, using the very same policy functions as the transitions, so the
 * inbox and the `allowedActions` of the detail can never disagree.
 */
@Service
@Transactional(readOnly = true)
public class InboxService {

    private final PurchaseRequestRepository requests;
    private final RequestVersionRepository versions;
    private final ApprovalStepRepository steps;
    private final RequestMapper mapper;

    public InboxService(PurchaseRequestRepository requests, RequestVersionRepository versions,
                        ApprovalStepRepository steps, RequestMapper mapper) {
        this.requests = requests;
        this.versions = versions;
        this.steps = steps;
        this.mapper = mapper;
    }

    private record Actionable(PurchaseRequestEntity request, ApprovalStepEntity step) {}

    public PageResponse<InboxItem> inbox(Actor actor, UUID costCenterFilter, int page, int size) {
        if (actor.role() == Role.SOLICITANTE) {
            throw new DomainException.Forbidden(ErrorCode.FORBIDDEN, "O papel SOLICITANTE não possui caixa de aprovação.");
        }
        // SQL pre-filter (pending + scope); the exact per-step rules run in Java below.
        // Draft-quality trade-off: one chain query per candidate — fine at this scale, a single SQL later.
        List<PurchaseRequestEntity> candidates = actor.isAdmin()
                ? requests.findByStatus(RequestStatus.PENDING_APPROVAL)
                : requests.findByStatusAndCostCenterId(RequestStatus.PENDING_APPROVAL, actor.costCenterId());

        List<Actionable> actionable = candidates.stream()
                .filter(r -> !r.isOwnedBy(actor.id()))
                .filter(r -> costCenterFilter == null || costCenterFilter.equals(r.getCostCenterId()))
                .flatMap(r -> actionableStep(actor, r).map(step -> new Actionable(r, step)).stream())
                .sorted(Comparator.comparing((Actionable a) -> a.request().getSubmittedAt(), Comparator.nullsLast(Comparator.<Instant>naturalOrder())))
                .toList();

        Map<UUID, String> names = mapper.userNames(actionable.stream()
                .flatMap(a -> Stream.of(a.request().getOwnerId(), a.step().getApproverId())).toList());
        Map<UUID, String> codes = mapper.centerCodes();
        List<InboxItem> items = actionable.stream()
                .map(a -> new InboxItem(mapper.summary(a.request(), names, codes), mapper.step(a.step(), names)))
                .toList();
        return PageResponse.slice(items, Math.max(page, 0), Math.clamp(size, 1, RequestQueryService.MAX_PAGE_SIZE));
    }

    private Optional<ApprovalStepEntity> actionableStep(Actor actor, PurchaseRequestEntity r) {
        var version = versions.findByRequestIdAndVersionNumber(r.getId(), r.getCurrentVersion()).orElseThrow();
        List<ApprovalStepEntity> chainEntities = steps.findByVersionIdOrderBySequenceAsc(version.getId());
        List<StepState> chain = chainEntities.stream().map(ApprovalStepEntity::toState).toList();
        return StepState.current(chain)
                .filter(step -> ApprovalPolicies.isEligible(actor, step.level(), version.getCostCenterId()))
                .filter(_ -> ApprovalPolicies.segregationViolation(actor, r.getOwnerId(), chain).isEmpty())
                .flatMap(step -> chainEntities.stream().filter(e -> e.getSequence() == step.sequence()).findFirst());
    }
}
