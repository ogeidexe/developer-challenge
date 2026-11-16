package com.example.purchase.domain;

import java.util.Collections;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.Map;
import java.util.Set;

/**
 * The transition table of README §4.2 as data. Who may act (owner / eligible approver / ADMIN) is checked
 * by the policies; this class only answers "is this action valid from this status, and where does it go".
 */
public final class RequestStateMachine {

    private static final Map<RequestStatus, Set<Action>> ALLOWED = new EnumMap<>(RequestStatus.class);

    static {
        ALLOWED.put(RequestStatus.DRAFT, EnumSet.of(Action.SUBMIT, Action.CANCEL));
        ALLOWED.put(RequestStatus.PENDING_APPROVAL, EnumSet.of(Action.APPROVE, Action.REJECT, Action.REQUEST_CHANGES, Action.CANCEL));
        ALLOWED.put(RequestStatus.CHANGES_REQUESTED, EnumSet.of(Action.SUBMIT, Action.CANCEL));
        for (RequestStatus s : RequestStatus.values()) {
            if (s.isFinal()) ALLOWED.put(s, EnumSet.noneOf(Action.class));
        }
    }

    private RequestStateMachine() {}

    public static boolean canApply(RequestStatus from, Action action) {
        return ALLOWED.get(from).contains(action);
    }

    public static Set<Action> allowedFrom(RequestStatus from) {
        return Collections.unmodifiableSet(ALLOWED.get(from));
    }

    /** First check of the 422 stage (README §4.3: state before level, segregation, comment, budget). */
    public static void require(RequestStatus from, Action action) {
        if (!canApply(from, action)) {
            String why = from.isFinal() ? "é um estado final" : "não permite esta ação";
            throw new DomainException.RuleViolation(ErrorCode.INVALID_TRANSITION,
                    "Não é possível %s: a solicitação está em %s, que %s.".formatted(action.verb(), from, why));
        }
    }

    /**
     * @param lastStep for APPROVE: whether the step being approved is the last one of the chain
     * @throws DomainException.RuleViolation INVALID_TRANSITION with an explanatory message
     */
    public static RequestStatus next(RequestStatus from, Action action, boolean lastStep) {
        require(from, action);
        return switch (action) {
            case SUBMIT -> RequestStatus.PENDING_APPROVAL;
            case APPROVE -> lastStep ? RequestStatus.APPROVED : RequestStatus.PENDING_APPROVAL;
            case REJECT -> RequestStatus.REJECTED;
            case REQUEST_CHANGES -> RequestStatus.CHANGES_REQUESTED;
            case CANCEL -> RequestStatus.CANCELLED;
        };
    }
}
