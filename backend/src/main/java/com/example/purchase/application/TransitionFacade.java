package com.example.purchase.application;

import com.example.purchase.api.dto.RequestDtos.RequestDetail;
import com.example.purchase.domain.Action;
import com.example.purchase.domain.Actor;
import com.example.purchase.domain.DomainException;
import org.springframework.stereotype.Service;

import java.util.UUID;

/**
 * Deliberately NOT transactional. When a final approval fails on budget, the exception leaves
 * {@link TransitionService#decide} → its transaction rolls back completely → only then the attempt is
 * audited, in a brand-new transaction (TRANSACTION-STRATEGY §4). Committing the event inside the failed
 * transition would also commit the lock bump and could leave a false audit row after a same-step race.
 */
@Service
public class TransitionFacade {

    private final TransitionService transitions;
    private final AuditService audit;

    public TransitionFacade(TransitionService transitions, AuditService audit) {
        this.transitions = transitions;
        this.audit = audit;
    }

    public RequestDetail submit(Actor actor, UUID id, int lockVersion) {
        return transitions.submit(actor, id, lockVersion);
    }

    public RequestDetail approve(Actor actor, UUID id, int lockVersion, String comment) {
        try {
            return transitions.decide(actor, id, Action.APPROVE, lockVersion, comment);
        } catch (DomainException.BudgetExceeded e) {
            audit.recordBudgetFailure(actor, e.attempt());
            throw e;
        }
    }

    public RequestDetail reject(Actor actor, UUID id, int lockVersion, String comment) {
        return transitions.decide(actor, id, Action.REJECT, lockVersion, comment);
    }

    public RequestDetail requestChanges(Actor actor, UUID id, int lockVersion, String comment) {
        return transitions.decide(actor, id, Action.REQUEST_CHANGES, lockVersion, comment);
    }

    public RequestDetail cancel(Actor actor, UUID id, int lockVersion) {
        return transitions.cancel(actor, id, lockVersion);
    }
}
