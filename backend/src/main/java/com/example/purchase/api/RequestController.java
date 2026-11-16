package com.example.purchase.api;

import com.example.purchase.api.dto.CommonDtos.PageResponse;
import com.example.purchase.api.dto.RequestDtos.*;
import com.example.purchase.application.*;
import com.example.purchase.application.RequestSpecifications.ListFilter;
import com.example.purchase.domain.Category;
import com.example.purchase.domain.DomainException;
import com.example.purchase.domain.Money;
import com.example.purchase.domain.RequestStatus;
import com.example.purchase.security.CurrentUser;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/requests")
public class RequestController {

    private final CurrentUser currentUser;
    private final RequestQueryService queries;
    private final IdempotencyService idempotentCreate;
    private final PurchaseRequestService requests;
    private final TransitionFacade transitions;

    public RequestController(CurrentUser currentUser, RequestQueryService queries, IdempotencyService idempotentCreate,
                             PurchaseRequestService requests, TransitionFacade transitions) {
        this.currentUser = currentUser;
        this.queries = queries;
        this.idempotentCreate = idempotentCreate;
        this.requests = requests;
        this.transitions = transitions;
    }

    /** ?page=0&size=20&sort=createdAt,desc&status=…&category=…&costCenterId=a,b&createdFrom=…&createdTo=…&minAmount=…&maxAmount=…&q=… */
    @GetMapping
    public PageResponse<RequestSummary> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String sort,
            @RequestParam(required = false) RequestStatus status,
            @RequestParam(required = false) Category category,
            @RequestParam(required = false) List<UUID> costCenterId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate createdFrom,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate createdTo,
            @RequestParam(required = false) String minAmount,
            @RequestParam(required = false) String maxAmount,
            @RequestParam(required = false) String q) {
        var filter = new ListFilter(status, category, costCenterId == null ? List.of() : costCenterId, createdFrom, createdTo,
                money("minAmount", minAmount), money("maxAmount", maxAmount), q);
        return queries.list(currentUser.get(), filter, page, size, sort);
    }

    /** Creates a DRAFT. Honors Idempotency-Key: a retry with the same key and payload replays the first 201. */
    @PostMapping
    public ResponseEntity<Object> create(@RequestHeader(name = "Idempotency-Key", required = false) String idempotencyKey,
                                         @Valid @RequestBody RequestInput body) {
        var outcome = idempotentCreate.create(currentUser.get(), idempotencyKey, body);
        return ResponseEntity.status(outcome.status())
                .contentType(MediaType.APPLICATION_JSON)
                .header("Idempotent-Replayed", String.valueOf(outcome.replayed()))
                .body(outcome.body());
    }

    @GetMapping("/{id}")
    public RequestDetail detail(@PathVariable UUID id) {
        return queries.detail(currentUser.get(), id);
    }

    @PutMapping("/{id}")
    public RequestDetail update(@PathVariable UUID id, @Valid @RequestBody RequestUpdateInput body) {
        return requests.update(currentUser.get(), id, body);
    }

    @GetMapping("/{id}/versions")
    public List<RequestVersionDto> versions(@PathVariable UUID id) {
        return queries.versions(currentUser.get(), id);
    }

    @GetMapping("/{id}/versions/{number}")
    public RequestVersionDto version(@PathVariable UUID id, @PathVariable int number) {
        return queries.version(currentUser.get(), id, number);
    }

    @GetMapping("/{id}/history")
    public List<EventDto> history(@PathVariable UUID id) {
        return queries.history(currentUser.get(), id);
    }

    // ---------- transitions: every body carries the current lockVersion (README §3.2) ----------

    @PostMapping("/{id}/submit")
    public RequestDetail submit(@PathVariable UUID id, @Valid @RequestBody TransitionInput body) {
        return transitions.submit(currentUser.get(), id, body.lockVersion());
    }

    @PostMapping("/{id}/approve")
    public RequestDetail approve(@PathVariable UUID id, @Valid @RequestBody TransitionInput body) {
        return transitions.approve(currentUser.get(), id, body.lockVersion(), body.comment());
    }

    @PostMapping("/{id}/reject")
    public RequestDetail reject(@PathVariable UUID id, @Valid @RequestBody TransitionInput body) {
        return transitions.reject(currentUser.get(), id, body.lockVersion(), body.comment());
    }

    @PostMapping("/{id}/request-changes")
    public RequestDetail requestChanges(@PathVariable UUID id, @Valid @RequestBody TransitionInput body) {
        return transitions.requestChanges(currentUser.get(), id, body.lockVersion(), body.comment());
    }

    @PostMapping("/{id}/cancel")
    public RequestDetail cancel(@PathVariable UUID id, @Valid @RequestBody TransitionInput body) {
        return transitions.cancel(currentUser.get(), id, body.lockVersion());
    }

    private static Money money(String field, String value) {
        if (value == null || value.isBlank()) return null;
        if (!Money.isValid(value)) throw DomainException.Invalid.field(field, "Use um valor como 1000.00.");
        return Money.parse(value);
    }
}
