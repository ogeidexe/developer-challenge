package com.example.purchase.application;

import com.example.purchase.api.dto.RequestDtos.RequestDetail;
import com.example.purchase.domain.*;
import com.example.purchase.persistence.*;
import jakarta.persistence.EntityManager;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.stream.IntStream;

/**
 * The state machine of README §4.2, one transaction per transition (README §5.1). Every method follows the
 * README §4.3 pipeline: 404 visibility → 403 role/owner → 409 lockVersion (the first write) → 422 rules.
 * Call through {@link TransitionFacade}, which audits failed final approvals after the rollback.
 */
@Service
public class TransitionService {

    private final PurchaseRequestRepository requests;
    private final RequestItemRepository items;
    private final RequestVersionRepository versions;
    private final VersionItemRepository versionItems;
    private final ApprovalStepRepository steps;
    private final BudgetRepository budgets;
    private final CostCenterRepository centers;
    private final RequestAccess access;
    private final RequestLock lock;
    private final AuditService audit;
    private final RequestMapper mapper;
    private final BusinessCalendar calendar;
    private final EntityManager em;

    public TransitionService(PurchaseRequestRepository requests, RequestItemRepository items, RequestVersionRepository versions,
                             VersionItemRepository versionItems, ApprovalStepRepository steps, BudgetRepository budgets,
                             CostCenterRepository centers, RequestAccess access, RequestLock lock, AuditService audit,
                             RequestMapper mapper, BusinessCalendar calendar, EntityManager em) {
        this.requests = requests;
        this.items = items;
        this.versions = versions;
        this.versionItems = versionItems;
        this.steps = steps;
        this.budgets = budgets;
        this.centers = centers;
        this.access = access;
        this.lock = lock;
        this.audit = audit;
        this.mapper = mapper;
        this.calendar = calendar;
        this.em = em;
    }

    /** DRAFT → PENDING_APPROVAL, or CHANGES_REQUESTED → PENDING_APPROVAL as a NEW version (v2, v3…). */
    @Transactional
    public RequestDetail submit(Actor actor, UUID id, int expectedLockVersion) {
        var loaded = access.loadVisible(actor, id);
        RequestAccess.requireOwner(actor, loaded, "submeter");
        var request = lock.claim(loaded, expectedLockVersion);
        RequestStatus from = request.getStatus();
        RequestStatus to = RequestStateMachine.next(from, Action.SUBMIT, false);

        List<RequestItemEntity> lines = items.findByRequestIdOrderByPositionAsc(id);
        if (lines.isEmpty()) {
            throw new DomainException.RuleViolation(ErrorCode.INVALID_TRANSITION, "Não é possível submeter: a solicitação não tem itens.");
        }
        Money total = Money.sum(lines.stream().map(RequestItemEntity::getLineTotal).toList());
        Instant now = calendar.now();
        int versionNumber = request.getCurrentVersion() + 1;

        // freeze the working copy; competence month = month of THIS submission in São Paulo (README §2.3 rule 5)
        var version = versions.save(new RequestVersionEntity(request, versionNumber, total, calendar.competenceMonth(now), actor.id(), now));
        versionItems.saveAll(lines.stream().map(line -> new VersionItemEntity(version.getId(), line)).toList());

        // the chain is rebuilt from zero for every version; approvals of older versions never count
        List<StepLevel> chain = ApprovalChainBuilder.build(total, request.getCategory());
        steps.saveAll(IntStream.range(0, chain.size())
                .mapToObj(i -> new ApprovalStepEntity(version.getId(), i + 1, chain.get(i))).toList());

        request.markSubmitted(versionNumber, total, now);
        audit.record(id, actor, versionNumber == 1 ? "SUBMITTED" : "RESUBMITTED", from, to, null, null, versionNumber, null);
        return finish(actor, id);
    }

    /** approve / reject / request-changes on the current step. */
    @Transactional
    public RequestDetail decide(Actor actor, UUID id, Action action, int expectedLockVersion, String comment) {
        StepStatus outcome = switch (action) {
            case APPROVE -> StepStatus.APPROVED;
            case REJECT -> StepStatus.REJECTED;
            case REQUEST_CHANGES -> StepStatus.RETURNED;
            case SUBMIT, CANCEL -> throw new IllegalArgumentException("not a decision: " + action);
        };
        var loaded = access.loadVisible(actor, id);                         // 404
        RequestAccess.requireApproverRole(actor);                            // 403 (SOLICITANTE never decides)
        var request = lock.claim(loaded, expectedLockVersion);               // 409 — first write, row locked
        RequestStatus from = request.getStatus();
        RequestStateMachine.require(from, action);                          // 422 INVALID_TRANSITION

        var version = currentVersion(request);
        List<ApprovalStepEntity> chainEntities = steps.findByVersionIdOrderBySequenceAsc(version.getId());
        List<StepState> chain = chainEntities.stream().map(ApprovalStepEntity::toState).toList();
        StepState current = StepState.current(chain)
                .orElseThrow(() -> new IllegalStateException("PENDING_APPROVAL request without a pending step: " + id));

        ApprovalPolicies.requireEligible(actor, current.level(), version.getCostCenterId(), centerCode(version.getCostCenterId())); // 422
        ApprovalPolicies.requireSegregation(actor, request.getOwnerId(), chain);   // 422 SELF_APPROVAL / DUPLICATE
        ApprovalPolicies.requireComment(action, comment);                          // 422 COMMENT_REQUIRED

        boolean lastStep = StepState.isLast(chain, current);
        RequestStatus to = RequestStateMachine.next(from, action, lastStep);
        if (action == Action.APPROVE && lastStep) {
            consumeBudget(request, version, current, comment);                     // 422 BUDGET_EXCEEDED → rollback
        }

        Instant now = calendar.now();
        UUID stepId = chainEntities.stream().filter(s -> s.getSequence() == current.sequence()).findFirst().orElseThrow().getId();
        if (steps.decide(stepId, outcome, actor.id(), now, blankToNull(comment), StepStatus.PENDING) == 0) {
            throw DomainException.Conflict.staleLock(request.getLockVersion()); // defense in depth behind the claim
        }
        if (action != Action.APPROVE) {
            steps.skipAfter(version.getId(), current.sequence(), StepStatus.SKIPPED, StepStatus.PENDING); // A-31
        }
        request.moveTo(to, now);
        String event = switch (action) {
            case APPROVE -> "APPROVED";
            case REJECT -> "REJECTED";
            default -> "CHANGES_REQUESTED";
        };
        audit.record(id, actor, event, from, to, current.level(), current.sequence(), version.getVersionNumber(), comment);
        return finish(actor, id);
    }

    /** DRAFT / PENDING_APPROVAL / CHANGES_REQUESTED → CANCELLED, by the owner or an ADMIN. */
    @Transactional
    public RequestDetail cancel(Actor actor, UUID id, int expectedLockVersion) {
        var loaded = access.loadVisible(actor, id);
        if (!loaded.isOwnedBy(actor.id()) && !actor.isAdmin()) {
            throw new DomainException.Forbidden(ErrorCode.NOT_REQUEST_OWNER, "Apenas o solicitante ou um ADMIN pode cancelar esta solicitação.");
        }
        var request = lock.claim(loaded, expectedLockVersion);
        RequestStatus from = request.getStatus();
        RequestStatus to = RequestStateMachine.next(from, Action.CANCEL, false);
        Instant now = calendar.now();

        if (from == RequestStatus.PENDING_APPROVAL) { // close the open chain (A-31)
            var version = currentVersion(request);
            steps.findByVersionIdOrderBySequenceAsc(version.getId()).stream()
                    .filter(s -> s.getStatus() == StepStatus.PENDING).findFirst()
                    .ifPresent(step -> {
                        steps.decide(step.getId(), StepStatus.CANCELLED, null, now, null, StepStatus.PENDING);
                        steps.skipAfter(version.getId(), step.getSequence(), StepStatus.SKIPPED, StepStatus.PENDING);
                    });
        }
        request.moveTo(to, now);
        audit.record(id, actor, "CANCELLED", from, to, null, null, request.getCurrentVersion(), null);
        return finish(actor, id);
    }

    // ---------- helpers ----------

    /**
     * Atomic conditional UPDATE on the version's frozen cost center, in the version's competence month.
     * On failure the exception rolls this transaction back (no lock bump, no step change survives);
     * {@link TransitionFacade} then audits the attempt in a new transaction.
     */
    private void consumeBudget(PurchaseRequestEntity request, RequestVersionEntity version, StepState step, String comment) {
        Money amount = version.getTotal();
        if (budgets.consume(version.getCostCenterId(), version.getCompetenceMonth(), amount.cents()) == 1) return;

        Money available = budgets.findByCostCenterIdAndYearMonth(version.getCostCenterId(), version.getCompetenceMonth())
                .map(BudgetEntity::getAvailable).orElse(Money.ZERO); // month without budget = zero balance
        throw new DomainException.BudgetExceeded(
                "O centro de custo %s tem %s disponíveis em %s; a solicitação exige %s."
                        .formatted(centerCode(version.getCostCenterId()), available.toBrl(), version.getCompetenceMonth(), amount.toBrl()),
                new DomainException.FailedApproval(request.getId(), step.level(), step.sequence(), version.getVersionNumber(), comment));
    }

    private RequestVersionEntity currentVersion(PurchaseRequestEntity request) {
        return versions.findByRequestIdAndVersionNumber(request.getId(), request.getCurrentVersion())
                .orElseThrow(() -> new IllegalStateException("missing version %d of %s".formatted(request.getCurrentVersion(), request.getId())));
    }

    private String centerCode(UUID costCenterId) {
        return centers.findById(costCenterId).map(CostCenterEntity::getCode).orElse("?");
    }

    private RequestDetail finish(Actor actor, UUID id) {
        em.flush();
        em.clear(); // bulk statements bypass the persistence context — re-read everything for the response
        return mapper.detail(actor, requests.findById(id).orElseThrow());
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.strip();
    }
}
