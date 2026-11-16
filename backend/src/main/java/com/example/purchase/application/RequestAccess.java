package com.example.purchase.application;

import com.example.purchase.domain.AccessPolicy;
import com.example.purchase.domain.Actor;
import com.example.purchase.domain.DomainException;
import com.example.purchase.domain.ErrorCode;
import com.example.purchase.domain.Role;
import com.example.purchase.persistence.PurchaseRequestEntity;
import com.example.purchase.persistence.PurchaseRequestRepository;
import org.springframework.stereotype.Component;

import java.util.UUID;

/**
 * The first stages of the README §4.3 pipeline, shared by reads and writes:
 * 404 (absent or invisible — ADR-012) → 403 (role / ownership). Runs inside the caller's transaction.
 */
@Component
public class RequestAccess {

    private final PurchaseRequestRepository requests;

    public RequestAccess(PurchaseRequestRepository requests) {
        this.requests = requests;
    }

    public PurchaseRequestEntity loadVisible(Actor actor, UUID id) {
        return requests.findById(id)
                .filter(r -> AccessPolicy.canSee(actor, r.getOwnerId(), r.getCostCenterId(), r.getStatus()))
                .orElseThrow(() -> new DomainException.NotFound("Solicitação não encontrada."));
    }

    public static void requireOwner(Actor actor, PurchaseRequestEntity r, String what) {
        if (!r.isOwnedBy(actor.id())) {
            throw new DomainException.Forbidden(ErrorCode.NOT_REQUEST_OWNER, "Apenas o solicitante pode " + what + " esta solicitação.");
        }
    }

    public static void requireApproverRole(Actor actor) {
        if (actor.role() == Role.SOLICITANTE) {
            throw new DomainException.Forbidden(ErrorCode.FORBIDDEN, "O papel SOLICITANTE não pode aprovar, rejeitar ou devolver solicitações.");
        }
    }

    public static void requireAdmin(Actor actor, String what) {
        if (!actor.isAdmin()) {
            throw new DomainException.Forbidden(ErrorCode.FORBIDDEN, "Apenas ADMIN pode " + what + ".");
        }
    }
}
