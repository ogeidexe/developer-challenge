package com.example.purchase.application;

import com.example.purchase.api.dto.RequestDtos.ItemInput;
import com.example.purchase.api.dto.RequestDtos.RequestDetail;
import com.example.purchase.api.dto.RequestDtos.RequestInput;
import com.example.purchase.api.dto.RequestDtos.RequestUpdateInput;
import com.example.purchase.domain.*;
import com.example.purchase.persistence.*;
import jakarta.persistence.EntityManager;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.stream.IntStream;

/** Create and edit the working copy (README §2.2). Transitions live in {@link TransitionService}. */
@Service
public class PurchaseRequestService {

    private final PurchaseRequestRepository requests;
    private final RequestItemRepository items;
    private final CostCenterRepository centers;
    private final RequestAccess access;
    private final RequestLock lock;
    private final AuditService audit;
    private final RequestMapper mapper;
    private final BusinessCalendar calendar;
    private final EntityManager em;

    public PurchaseRequestService(PurchaseRequestRepository requests, RequestItemRepository items, CostCenterRepository centers,
                                  RequestAccess access, RequestLock lock, AuditService audit, RequestMapper mapper,
                                  BusinessCalendar calendar, EntityManager em) {
        this.requests = requests;
        this.items = items;
        this.centers = centers;
        this.access = access;
        this.lock = lock;
        this.audit = audit;
        this.mapper = mapper;
        this.calendar = calendar;
        this.em = em;
    }

    /** A validated line: the price is parsed once into exact cents. */
    private record Line(String description, int quantity, Money unitPrice) {
        Money total() { return unitPrice.times(quantity); }
    }

    @Transactional
    public RequestDetail create(Actor actor, RequestInput in) {
        UUID costCenterId = in.costCenterId() != null ? in.costCenterId() : actor.costCenterId(); // default: own center
        List<Line> lines = validate(in, costCenterId);
        Instant now = calendar.now();

        var request = new PurchaseRequestEntity("REQ-%06d".formatted(requests.nextRequestNumber()), actor.id(), now);
        request.updateWorkingCopy(in.title().strip(), blankToNull(in.description()), in.category(), costCenterId,
                in.neededBy(), totalOf(lines), now); // the client never sends a total (README §2.2)
        requests.save(request);
        items.saveAll(toEntities(request.getId(), lines));
        audit.record(request.getId(), actor, "REQUEST_CREATED", null, RequestStatus.DRAFT, null, null, 0, null);
        return finish(actor, request.getId());
    }

    /** Pipeline: 404 (visibility) → 403 (owner) → 409 (lockVersion) → 422 (state) → 400 (payload rules). */
    @Transactional
    public RequestDetail update(Actor actor, UUID id, RequestUpdateInput in) {
        var loaded = access.loadVisible(actor, id);
        RequestAccess.requireOwner(actor, loaded, "editar");
        var request = lock.claim(loaded, in.lockVersion());
        if (!request.getStatus().isEditable()) {
            throw new DomainException.RuleViolation(ErrorCode.INVALID_TRANSITION,
                    "Não é possível editar: a solicitação está em %s; a edição só é permitida em DRAFT ou CHANGES_REQUESTED."
                            .formatted(request.getStatus()));
        }
        UUID costCenterId = in.costCenterId() != null ? in.costCenterId() : request.getCostCenterId();
        List<Line> lines = validate(in.toInput(), costCenterId);

        items.deleteByRequestId(id); // wholesale replace of the working copy; frozen versions are untouched
        items.saveAll(toEntities(id, lines));
        request.updateWorkingCopy(in.title().strip(), blankToNull(in.description()), in.category(), costCenterId,
                in.neededBy(), totalOf(lines), calendar.now());
        audit.record(id, actor, "EDITED", request.getStatus(), request.getStatus(), null, null, request.getCurrentVersion(), null);
        return finish(actor, id);
    }

    // ---------- helpers ----------

    /** Rules the bean-validation annotations cannot express → 400 with per-field errors. */
    private List<Line> validate(RequestInput in, UUID costCenterId) {
        var errors = new ArrayList<DomainException.FieldError>();
        if (costCenterId == null) {
            errors.add(new DomainException.FieldError("costCenterId", "Informe o centro de custo (usuários globais não têm um padrão).", "REQUIRED"));
        } else if (!centers.existsById(costCenterId)) {
            errors.add(new DomainException.FieldError("costCenterId", "Centro de custo não encontrado.", "INVALID"));
        }
        if (in.neededBy() != null && !calendar.isFuture(in.neededBy())) {
            errors.add(new DomainException.FieldError("neededBy", "A data de necessidade precisa ser futura.", "INVALID"));
        }
        List<Line> lines = new ArrayList<>();
        for (int i = 0; i < in.items().size(); i++) {
            ItemInput item = in.items().get(i);
            if (!Money.isValid(item.unitPrice()) || Money.parse(item.unitPrice()).cents() == 0) {
                errors.add(new DomainException.FieldError("items[%d].unitPrice".formatted(i), "O preço unitário precisa ser maior que zero.", "INVALID"));
            } else {
                lines.add(new Line(item.description().strip(), item.quantity(), Money.parse(item.unitPrice())));
            }
        }
        if (errors.isEmpty()) {
            try {
                totalOf(lines);
            } catch (ArithmeticException overflow) {
                errors.add(new DomainException.FieldError("items", "O valor total excede o limite permitido.", "INVALID"));
            }
        }
        if (!errors.isEmpty()) throw new DomainException.Invalid(ErrorCode.VALIDATION_FAILED, "Um ou mais campos são inválidos.", errors);
        return lines;
    }

    private static Money totalOf(List<Line> lines) {
        return Money.sum(lines.stream().map(Line::total).toList());
    }

    private static List<RequestItemEntity> toEntities(UUID requestId, List<Line> lines) {
        return IntStream.range(0, lines.size())
                .mapToObj(i -> new RequestItemEntity(requestId, i, lines.get(i).description(), lines.get(i).quantity(), lines.get(i).unitPrice()))
                .toList();
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
