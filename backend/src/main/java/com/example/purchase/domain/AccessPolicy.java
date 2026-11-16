package com.example.purchase.domain;

import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/** Visibility (README §2.2, ADR-012) and the `allowedActions` list of the detail endpoint (README §2.7). */
public final class AccessPolicy {

    private AccessPolicy() {}

    /**
     * SOLICITANTE: own requests. APROVADOR: own + non-draft requests of their cost center.
     * ADMIN: own + every non-draft request. A DRAFT is visible to its owner only — ADMIN included (A-26).
     */
    public static boolean canSee(Actor actor, UUID ownerId, UUID costCenterId, RequestStatus status) {
        if (actor.is(ownerId)) return true;
        if (status == RequestStatus.DRAFT) return false;
        return switch (actor.role()) {
            case ADMIN -> true;
            case APROVADOR -> costCenterId.equals(actor.costCenterId());
            case SOLICITANTE -> false;
        };
    }

    /** Snapshot of what `allowedActions` depends on. */
    public record RequestView(UUID ownerId, RequestStatus status, UUID versionCostCenterId, List<StepState> currentChain) {}

    /**
     * Server-side source of truth for the buttons the front-end renders — it uses the same policies as the
     * transitions, so a button is shown only if the action would pass every rule except concurrency/budget.
     */
    public static Set<AllowedAction> allowedActions(Actor actor, RequestView r) {
        Set<AllowedAction> actions = EnumSet.noneOf(AllowedAction.class);
        if (r.status().isFinal()) return actions;

        boolean owner = actor.is(r.ownerId());
        if (owner && r.status().isEditable()) {
            actions.add(AllowedAction.EDIT);
            actions.add(AllowedAction.SUBMIT);
        }
        if (owner || actor.isAdmin()) actions.add(AllowedAction.CANCEL);

        if (r.status() == RequestStatus.PENDING_APPROVAL && actor.role() != Role.SOLICITANTE) {
            StepState.current(r.currentChain())
                    .filter(step -> ApprovalPolicies.isEligible(actor, step.level(), r.versionCostCenterId()))
                    .filter(_ -> ApprovalPolicies.segregationViolation(actor, r.ownerId(), r.currentChain()).isEmpty())
                    .ifPresent(_ -> actions.addAll(EnumSet.of(AllowedAction.APPROVE, AllowedAction.REJECT, AllowedAction.REQUEST_CHANGES)));
        }
        return actions;
    }
}
