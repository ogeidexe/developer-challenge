package com.example.purchase.application;

import com.example.purchase.config.RequestContext;
import com.example.purchase.domain.*;
import com.example.purchase.persistence.RequestEventEntity;
import com.example.purchase.persistence.RequestEventRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/** Append-only history (README §2.5): actor, role, action, from/to status, step, version, comment, UTC time, X-Request-Id. */
@Service
public class AuditService {

    private final RequestEventRepository events;
    private final BusinessCalendar calendar;

    public AuditService(RequestEventRepository events, BusinessCalendar calendar) {
        this.events = events;
        this.calendar = calendar;
    }

    /** Joins the caller's transaction (MANDATORY): an action and its event commit or roll back together. */
    @Transactional(propagation = Propagation.MANDATORY)
    public void record(UUID requestId, Actor actor, String action, RequestStatus from, RequestStatus to,
                       StepLevel stepLevel, Integer stepSequence, int versionNumber, String comment) {
        events.save(new RequestEventEntity(requestId, actor.id(), actor.role(), action, from, to, stepLevel,
                stepSequence, versionNumber, blankToNull(comment), RequestContext.requestId(), calendar.now()));
    }

    /**
     * The failed final approval is audited in its OWN transaction, after the transition transaction rolled
     * back entirely — no lock bump or step change survives, only the evidence of the attempt
     * (TRANSACTION-STRATEGY §4).
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordBudgetFailure(Actor actor, DomainException.FailedApproval attempt) {
        record(attempt.requestId(), actor, "APPROVAL_FAILED_BUDGET", RequestStatus.PENDING_APPROVAL,
                RequestStatus.PENDING_APPROVAL, attempt.stepLevel(), attempt.stepSequence(), attempt.versionNumber(),
                attempt.comment());
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.strip();
    }
}
