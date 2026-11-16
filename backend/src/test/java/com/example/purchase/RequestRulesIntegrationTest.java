package com.example.purchase;

import com.example.purchase.api.dto.RequestDtos.EventDto;
import com.example.purchase.api.dto.RequestDtos.ItemInput;
import com.example.purchase.api.dto.RequestDtos.RequestDetail;
import com.example.purchase.api.dto.RequestDtos.RequestSummary;
import com.example.purchase.api.dto.RequestDtos.RequestUpdateInput;
import com.example.purchase.application.IdempotencyService;
import com.example.purchase.application.RequestQueryService;
import com.example.purchase.application.RequestSpecifications.ListFilter;
import com.example.purchase.domain.ApproverLevel;
import com.example.purchase.domain.Category;
import com.example.purchase.domain.DomainException;
import com.example.purchase.domain.ErrorCode;
import com.example.purchase.domain.Money;
import com.example.purchase.domain.RequestStatus;
import com.example.purchase.domain.Role;
import com.example.purchase.domain.StepLevel;
import com.example.purchase.persistence.CostCenterEntity;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.math.BigDecimal;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Request rules on a real PostgreSQL that the original suites left uncovered: editing outside the editable
 * states (RF-03), sorting/paging/filters (RF-04), a v2 with a different chain (RF-09), the full history
 * (RF-11) and idempotency edge cases (RNF-03). Each test names the acceptance criterion it covers.
 */
@Testcontainers(disabledWithoutDocker = true)
class RequestRulesIntegrationTest extends IntegrationTest {

    @Autowired RequestQueryService queries;
    @Autowired IdempotencyService idempotency;

    private static RequestUpdateInput edit(RequestDetail r, int quantity, String unitPrice) {
        return new RequestUpdateInput(r.title(), r.description(), r.category(), null, null,
                List.of(new ItemInput("Item editado", quantity, unitPrice)), r.lockVersion());
    }

    private static ListFilter filter(RequestStatus status, Category category) {
        return new ListFilter(status, category, List.of(), null, null, null, null, null);
    }

    // ---------- RF-03 ----------

    /** CA-03.3 and RN-03.7: a request can only be edited in DRAFT or CHANGES_REQUESTED. */
    @Test
    void editingOutsideTheEditableStatesIsAnInvalidTransition() {
        var pending = createAndSubmit(owner, "Monitor", Category.EQUIPMENT, "800.00");
        assertThatThrownBy(() -> requests.update(owner, pending.id(), edit(pending, 2, "800.00")))
                .isInstanceOfSatisfying(DomainException.RuleViolation.class, e -> assertThat(e.code()).isEqualTo(ErrorCode.INVALID_TRANSITION));

        var cancelled = transitions.cancel(owner, pending.id(), pending.lockVersion());
        assertThatThrownBy(() -> requests.update(owner, cancelled.id(), edit(cancelled, 2, "800.00")))
                .isInstanceOfSatisfying(DomainException.RuleViolation.class, e -> assertThat(e.code()).isEqualTo(ErrorCode.INVALID_TRANSITION));

        var draft = requests.create(owner, input("Rascunho", Category.OTHER, 1, "10.00"));
        assertThat(requests.update(owner, draft.id(), edit(draft, 3, "10.00")).total()).isEqualTo("30.00"); // DRAFT is editable
    }

    // ---------- RF-04 ----------

    /** CA-04.3 and RN-04.5: only whitelisted fields and asc|desc; the default is createdAt,desc. */
    @Test
    void sortingAcceptsOnlyTheWhitelistedFields() {
        for (String bad : List.of("password,asc", "total,sideways", "ownerId")) {
            assertThatThrownBy(() -> queries.list(admin1, ListFilter.none(), 0, 20, bad))
                    .isInstanceOfSatisfying(DomainException.Invalid.class, e -> assertThat(e.code()).isEqualTo(ErrorCode.INVALID_SORT));
        }
        createAndSubmit(owner, "Barato", Category.OTHER, "100.00");
        createAndSubmit(owner, "Caro", Category.OTHER, "900.00");
        createAndSubmit(owner, "Medio", Category.OTHER, "500.00");

        List<BigDecimal> byTotalDesc = queries.list(admin1, ListFilter.none(), 0, 20, "total,desc").data().stream()
                .map(RequestSummary::total).map(BigDecimal::new).toList();
        assertThat(byTotalDesc).isSortedAccordingTo(Comparator.<BigDecimal>reverseOrder()).hasSize(3);
        assertThat(queries.list(admin1, ListFilter.none(), 0, 20, null).data().getFirst().title()).isEqualTo("Medio"); // newest first
    }

    /** CA-04.4 and RN-04.4: size is clamped to 1..100 and a negative page becomes 0. */
    @Test
    void pageSizeIsClampedAndTheEnvelopeIsComplete() {
        for (int i = 0; i < 3; i++) createAndSubmit(owner, "Pedido " + i, Category.OTHER, "100.00");

        var huge = queries.list(admin1, ListFilter.none(), 0, 1000, null);
        assertThat(huge.size()).isEqualTo(100);
        assertThat(huge.totalElements()).isEqualTo(3L);

        var tiny = queries.list(admin1, ListFilter.none(), -5, 0, null);
        assertThat(tiny.page()).isZero();
        assertThat(tiny.size()).isEqualTo(1);
        assertThat(tiny.data()).hasSize(1);
        assertThat(tiny.totalPages()).isEqualTo(3);
    }

    /** CA-04.6, RN-04.6, RN-04.7 and RN-04.8: filters combine, and never widen the caller's visibility. */
    @Test
    void filtersCombineInsideTheCallersVisibility() {
        var otherCc = centers.save(new CostCenterEntity("CC-F-" + UUID.randomUUID().toString().substring(0, 6), "Filtros")).getId();
        var otherOwner = user(Role.SOLICITANTE, null, otherCc);
        var softwarePending = createAndSubmit(owner, "Licença IDE", Category.SOFTWARE, "300.00");
        createAndSubmit(owner, "Mesa", Category.EQUIPMENT, "300.00");
        requests.create(owner, input("Licença rascunho", Category.SOFTWARE, 1, "300.00"));
        createAndSubmit(otherOwner, "Licença de outro centro", Category.SOFTWARE, "300.00");

        var result = queries.list(n1, filter(RequestStatus.PENDING_APPROVAL, Category.SOFTWARE), 0, 20, null).data();
        assertThat(result).extracting(RequestSummary::id).containsExactly(softwarePending.id());

        var byAmount = new ListFilter(null, null, List.of(), null, null, Money.parse("250.00"), Money.parse("350.00"), "licença");
        assertThat(queries.list(admin1, byAmount, 0, 20, null).data()).extracting(RequestSummary::title)
                .containsExactlyInAnyOrder("Licença IDE", "Licença de outro centro"); // the draft stays owner-only

        var byCenter = new ListFilter(null, null, List.of(otherCc), null, null, null, null, null);
        assertThat(queries.list(n1, byCenter, 0, 20, null).data()).isEmpty(); // asking for another center does not widen
    }

    // ---------- RF-09 ----------

    /** CA-09.5 and RN-09.4: the v2 chain is rebuilt from the new total; v1 keeps its own chain. */
    @Test
    void aResubmittedVersionGetsAChainBuiltFromItsOwnTotal() {
        var v1 = createAndSubmit(owner, "Switch", Category.EQUIPMENT, "5000.00"); // [N1, N2]
        var returned = transitions.requestChanges(n1, v1.id(), v1.lockVersion(), "Reduzir o valor do pedido.");
        var edited = requests.update(owner, returned.id(), edit(returned, 1, "500.00"));
        var v2 = transitions.submit(owner, edited.id(), edited.lockVersion());

        assertThat(v2.currentVersion()).isEqualTo(2);
        assertThat(v2.steps()).extracting(s -> s.level()).containsExactly(StepLevel.NIVEL_1);
        var versions = queries.versions(owner, v2.id());
        assertThat(versions).hasSize(2);
        assertThat(versions.getFirst().steps()).extracting(s -> s.level()).containsExactly(StepLevel.NIVEL_1, StepLevel.NIVEL_2);
        assertThat(versions.getFirst().total()).isEqualTo("5000.00");
    }

    // ---------- RF-11 ----------

    /** CA-11.1, CA-11.5, RN-11.1, RN-11.2 and RN-11.6: every action is in the history, in order, with its details. */
    @Test
    void historyListsEveryActionInOrderWithActorRoleStepVersionAndComment() {
        var r = createAndSubmit(owner, "Switch", Category.EQUIPMENT, "5000.00"); // [N1, N2]
        r = transitions.approve(n1, r.id(), r.lockVersion(), "De acordo.");
        transitions.reject(n2, r.id(), r.lockVersion(), "Fora do orçamento do trimestre.");

        List<EventDto> history = queries.history(owner, r.id());
        assertThat(history).extracting(EventDto::action).containsExactly("REQUEST_CREATED", "SUBMITTED", "APPROVED", "REJECTED");
        assertThat(history).extracting(EventDto::occurredAt).isSorted();

        var rejection = history.getLast();
        assertThat(rejection.actor().id()).isEqualTo(n2.id());
        assertThat(rejection.actorRole()).isEqualTo(Role.APROVADOR);
        assertThat(rejection.fromStatus()).isEqualTo(RequestStatus.PENDING_APPROVAL);
        assertThat(rejection.toStatus()).isEqualTo(RequestStatus.REJECTED);
        assertThat(rejection.stepLevel()).isEqualTo(StepLevel.NIVEL_2);
        assertThat(rejection.versionNumber()).isEqualTo(1);
        assertThat(rejection.comment()).isEqualTo("Fora do orçamento do trimestre.");
        assertThat(history.get(2).comment()).isEqualTo("De acordo.");

        var otherCc = centers.save(new CostCenterEntity("CC-H-" + UUID.randomUUID().toString().substring(0, 6), "Hist")).getId();
        var stranger = user(Role.APROVADOR, ApproverLevel.NIVEL_1, otherCc);
        var requestId = r.id();
        assertThatThrownBy(() -> queries.history(stranger, requestId)).isInstanceOf(DomainException.NotFound.class); // RN-11.5
    }

    // ---------- RNF-03 ----------

    /** CA-R03.3 and RN-R03.2: the same key used by another user is independent. */
    @Test
    void anIdempotencyKeyBelongsToOneUser() {
        var payload = input("Notebooks", Category.EQUIPMENT, 1, "4899.90");
        var fromOwner = idempotency.create(owner, "shared-key", payload);
        var fromApprover = idempotency.create(n1, "shared-key", payload);

        assertThat(fromOwner.replayed()).isFalse();
        assertThat(fromApprover.replayed()).isFalse();
        assertThat(jdbc.sql("SELECT count(*) FROM purchase_requests").query(Long.class).single()).isEqualTo(2L);
    }

    /** CA-R03.4 and RN-R03.5: prices are normalized to cents, so "10" and "10.00" are the same payload. */
    @Test
    void equivalentPayloadsReplayInsteadOfConflicting() {
        var first = idempotency.create(owner, "norm-key", input("Cabos", Category.SUPPLIES, 2, "10"));
        var same = idempotency.create(owner, "norm-key", input("Cabos", Category.SUPPLIES, 2, "10.00"));

        assertThat(first.replayed()).isFalse();
        assertThat(same.replayed()).isTrue();
        assertThat(jdbc.sql("SELECT count(*) FROM purchase_requests").query(Long.class).single()).isEqualTo(1L);
    }
}
