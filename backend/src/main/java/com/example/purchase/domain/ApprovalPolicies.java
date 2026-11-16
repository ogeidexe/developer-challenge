package com.example.purchase.domain;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Who may decide the current step (README §2.3 rules 2–4). Evaluation order follows README §4.3 —
 * level / cost center → segregation → comment — so the 422 code is deterministic when several rules fail.
 */
public final class ApprovalPolicies {

    public static final int MIN_COMMENT_LENGTH = 10;

    private ApprovalPolicies() {}

    /**
     * NIVEL_1 ← APROVADOR (N1 or N2) of the version's cost center, or ADMIN;
     * NIVEL_2 ← APROVADOR N2 of the version's cost center, or ADMIN;
     * ADMIN   ← ADMIN only (any ADMIN, global or scoped — A-21).
     */
    public static boolean isEligible(Actor actor, StepLevel level, UUID versionCostCenterId) {
        if (actor.isAdmin()) return true;
        if (actor.role() != Role.APROVADOR || !versionCostCenterId.equals(actor.costCenterId())) return false;
        return switch (level) {
            case NIVEL_1 -> true;
            case NIVEL_2 -> actor.approverLevel() == ApproverLevel.NIVEL_2;
            case ADMIN -> false;
        };
    }

    public static void requireEligible(Actor actor, StepLevel level, UUID versionCostCenterId, String costCenterCode) {
        if (isEligible(actor, level, versionCostCenterId)) return;
        String who = switch (level) {
            case NIVEL_1 -> "um APROVADOR (NIVEL_1 ou NIVEL_2) do centro de custo " + costCenterCode + " ou um ADMIN";
            case NIVEL_2 -> "um APROVADOR NIVEL_2 do centro de custo " + costCenterCode + " ou um ADMIN";
            case ADMIN -> "um ADMIN";
        };
        throw new DomainException.RuleViolation(ErrorCode.APPROVER_NOT_ELIGIBLE,
                "Não é possível decidir: a etapa %s exige %s.".formatted(level, who));
    }

    /**
     * Segregation of duties: nobody decides their own request, and the same person never decides two steps
     * of the SAME version (a new version starts clean — README §2.3 rule 6).
     */
    public static Optional<ErrorCode> segregationViolation(Actor actor, UUID ownerId, List<StepState> versionChain) {
        if (actor.is(ownerId)) return Optional.of(ErrorCode.SELF_APPROVAL_FORBIDDEN);
        boolean alreadyDecided = versionChain.stream()
                .anyMatch(s -> s.status() == StepStatus.APPROVED && actor.is(s.approverId()));
        return alreadyDecided ? Optional.of(ErrorCode.DUPLICATE_APPROVER) : Optional.empty();
    }

    public static void requireSegregation(Actor actor, UUID ownerId, List<StepState> versionChain) {
        segregationViolation(actor, ownerId, versionChain).ifPresent(code -> {
            String detail = switch (code) {
                case SELF_APPROVAL_FORBIDDEN -> "Não é possível decidir: você é o solicitante desta solicitação (segregação de funções).";
                default -> {
                    StepLevel decided = versionChain.stream()
                            .filter(s -> actor.is(s.approverId())).map(StepState::level).findFirst().orElseThrow();
                    yield "Não é possível decidir: você já aprovou a etapa %s desta versão (segregação de funções).".formatted(decided);
                }
            };
            throw new DomainException.RuleViolation(code, detail);
        });
    }

    /** Comment: optional on approve; mandatory (≥ 10 chars) on reject and request-changes (README §2.3 rule 4). */
    public static void requireComment(Action action, String comment) {
        boolean required = action == Action.REJECT || action == Action.REQUEST_CHANGES;
        if (required && (comment == null || comment.strip().length() < MIN_COMMENT_LENGTH)) {
            throw new DomainException.RuleViolation(ErrorCode.COMMENT_REQUIRED,
                    "Não é possível %s: o comentário é obrigatório e precisa ter pelo menos %d caracteres."
                            .formatted(action.verb(), MIN_COMMENT_LENGTH));
        }
    }
}
