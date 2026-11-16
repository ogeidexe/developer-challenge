package com.example.purchase;

import com.example.purchase.api.dto.RequestDtos.ItemInput;
import com.example.purchase.api.dto.RequestDtos.RequestDetail;
import com.example.purchase.api.dto.RequestDtos.RequestUpdateInput;
import com.example.purchase.api.dto.RequestDtos.StepDto;
import com.example.purchase.application.IdempotencyService;
import com.example.purchase.application.RequestQueryService;
import com.example.purchase.domain.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.springframework.dao.DataAccessException;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** The README §5.2 minimum integration scenarios, on a real PostgreSQL. */
@Testcontainers(disabledWithoutDocker = true) // also on the base; repeated in case the annotation is not inherited
class WorkflowIntegrationTest extends IntegrationTest {

    @Autowired RequestQueryService queries;
    @Autowired IdempotencyService idempotency;

    @Test
    void fullThreeStepFlowReachesApprovedAndConsumesTheBudget() {
        budget(cc, "50000.00");
        var r = createAndSubmit(owner, "Servidor", Category.EQUIPMENT, "12000.00");
        assertThat(r.steps()).extracting(StepDto::level).containsExactly(StepLevel.NIVEL_1, StepLevel.NIVEL_2, StepLevel.ADMIN);

        r = transitions.approve(n1, r.id(), r.lockVersion(), null);
        r = transitions.approve(n2, r.id(), r.lockVersion(), "De acordo.");
        r = transitions.approve(admin1, r.id(), r.lockVersion(), null);

        assertThat(r.status()).isEqualTo(RequestStatus.APPROVED);
        assertThat(r.steps()).extracting(StepDto::status).containsOnly(StepStatus.APPROVED);
        assertThat(r.allowedActions()).isEmpty();
        assertThat(consumed(cc)).isEqualTo(Money.parse("12000.00"));
        assertThat(queries.history(owner, r.id())).extracting(e -> e.action())
                .containsExactly("REQUEST_CREATED", "SUBMITTED", "APPROVED", "APPROVED", "APPROVED");
    }

    @Test
    void segregationOfDuties() {
        budget(cc, "50000.00");
        // an approver's own request: never approvable by them
        var own = createAndSubmit(n2, "Pedido do aprovador", Category.OTHER, "500.00");
        var ownLock = own.lockVersion();
        assertThatThrownBy(() -> transitions.approve(n2, own.id(), ownLock, null))
                .isInstanceOfSatisfying(DomainException.RuleViolation.class, e -> assertThat(e.code()).isEqualTo(ErrorCode.SELF_APPROVAL_FORBIDDEN));

        // the same person cannot approve two steps of the same version (N2 may approve N1, then not N2)
        var r = createAndSubmit(owner, "Switch", Category.EQUIPMENT, "5000.00");
        var afterN1 = transitions.approve(n2, r.id(), r.lockVersion(), null);
        assertThatThrownBy(() -> transitions.approve(n2, afterN1.id(), afterN1.lockVersion(), null))
                .isInstanceOfSatisfying(DomainException.RuleViolation.class, e -> {
                    assertThat(e.code()).isEqualTo(ErrorCode.DUPLICATE_APPROVER);
                    assertThat(e.detail()).contains("NIVEL_1");
                });
    }

    @Test
    void budgetExceededKeepsTheRequestPendingAndOnlyAuditsTheAttempt() {
        budget(cc, "800.00");
        var r = createAndSubmit(owner, "Kit periféricos", Category.SUPPLIES, "900.00"); // chain [N1] → N1 is final

        assertThatThrownBy(() -> transitions.approve(n1, r.id(), r.lockVersion(), null))
                .isInstanceOfSatisfying(DomainException.BudgetExceeded.class, e -> assertThat(e.detail()).contains("800,00").contains("900,00"));

        var after = queries.detail(owner, r.id());
        assertThat(after.status()).isEqualTo(RequestStatus.PENDING_APPROVAL);
        assertThat(after.lockVersion()).isEqualTo(r.lockVersion()); // full rollback — not even the lock bump survived
        assertThat(after.steps().getFirst().status()).isEqualTo(StepStatus.PENDING);
        assertThat(consumed(cc)).isEqualTo(Money.ZERO);
        assertThat(queries.history(owner, r.id())).extracting(e -> e.action()).contains("APPROVAL_FAILED_BUDGET");
    }

    @Test
    void monthWithoutBudgetHasZeroBalance() {
        var r = createAndSubmit(owner, "Sem orçamento", Category.OTHER, "10.00");
        assertThatThrownBy(() -> transitions.approve(n1, r.id(), r.lockVersion(), null))
                .isInstanceOf(DomainException.BudgetExceeded.class);
    }

    @Test
    void returnEditResubmitCreatesV2AndKeepsV1Immutable() {
        budget(cc, "50000.00");
        var r = createAndSubmit(owner, "Switch", Category.EQUIPMENT, "5000.00");
        r = transitions.approve(n1, r.id(), r.lockVersion(), null);
        r = transitions.requestChanges(n2, r.id(), r.lockVersion(), "Detalhar a quantidade de portas.");
        assertThat(r.status()).isEqualTo(RequestStatus.CHANGES_REQUESTED);

        r = requests.update(owner, r.id(), new RequestUpdateInput(r.title(), null, Category.EQUIPMENT, null, null,
                List.of(new ItemInput("Switch 24 portas", 2, "2000.00")), r.lockVersion()));
        r = transitions.submit(owner, r.id(), r.lockVersion());

        assertThat(r.currentVersion()).isEqualTo(2);
        assertThat(r.total()).isEqualTo("4000.00");
        assertThat(r.steps()).extracting(StepDto::status).containsOnly(StepStatus.PENDING); // chain rebuilt from zero

        var v1 = queries.version(owner, r.id(), 1);
        assertThat(v1.total()).isEqualTo("5000.00");
        assertThat(v1.steps()).extracting(StepDto::status).containsExactly(StepStatus.APPROVED, StepStatus.RETURNED);

        // segregation resets per version: the v1 N1 approver may approve N1 of v2
        var v2 = transitions.approve(n1, r.id(), r.lockVersion(), null);
        assertThat(v2.steps().getFirst().status()).isEqualTo(StepStatus.APPROVED);
    }

    @Test
    void rejectNeedsAMeaningfulCommentAndClosesTheChain() {
        var r = createAndSubmit(owner, "Drone", Category.EQUIPMENT, "15000.00");
        int lock = r.lockVersion();
        assertThatThrownBy(() -> transitions.reject(n1, r.id(), lock, "curto"))
                .isInstanceOfSatisfying(DomainException.RuleViolation.class, e -> assertThat(e.code()).isEqualTo(ErrorCode.COMMENT_REQUIRED));

        var rejected = transitions.reject(n1, r.id(), lock, "Fora do escopo deste semestre.");
        assertThat(rejected.status()).isEqualTo(RequestStatus.REJECTED);
        assertThat(rejected.steps()).extracting(StepDto::status)
                .containsExactly(StepStatus.REJECTED, StepStatus.SKIPPED, StepStatus.SKIPPED);
    }

    @Test
    void staleLockVersionIs409AndChangesNothing() {
        var r = createAndSubmit(owner, "Stale", Category.OTHER, "100.00");
        int stale = r.lockVersion() - 1;
        assertThatThrownBy(() -> transitions.approve(n1, r.id(), stale, null))
                .isInstanceOfSatisfying(DomainException.Conflict.class, e -> assertThat(e.currentLockVersion()).isEqualTo(r.lockVersion()));
        assertThat(queries.detail(owner, r.id()).lockVersion()).isEqualTo(r.lockVersion());
    }

    @Test
    void idempotentCreateReplaysTheStoredResponse() {
        var payload = input("Notebooks", Category.EQUIPMENT, 5, "4899.90");

        var first = idempotency.create(owner, "key-1", payload);
        var retry = idempotency.create(owner, "key-1", payload);

        assertThat(first.replayed()).isFalse();
        assertThat(retry.replayed()).isTrue();
        assertThat((String) retry.body()).contains(((RequestDetail) first.body()).id().toString());
        assertThat(jdbc.sql("SELECT count(*) FROM purchase_requests").query(Long.class).single()).isEqualTo(1L);

        var changed = input("Notebooks", Category.EQUIPMENT, 6, "4899.90");
        assertThatThrownBy(() -> idempotency.create(owner, "key-1", changed))
                .isInstanceOfSatisfying(DomainException.Conflict.class, e -> assertThat(e.code()).isEqualTo(ErrorCode.IDEMPOTENCY_PAYLOAD_MISMATCH));
    }

    @Test
    void draftsAreInvisibleEvenToAdmin() {
        var draft = requests.create(owner, input("Rascunho", Category.OTHER, 1, "10.00"));
        assertThatThrownBy(() -> queries.detail(admin1, draft.id())).isInstanceOf(DomainException.NotFound.class);
    }

    @Test
    void historyAndSnapshotsAreImmutableInTheDatabase() {
        createAndSubmit(owner, "Imutável", Category.OTHER, "10.00");
        assertThatThrownBy(() -> jdbc.sql("UPDATE request_events SET comment = 'x'").update())
                .isInstanceOf(DataAccessException.class).hasMessageContaining("immutable");
        assertThatThrownBy(() -> jdbc.sql("DELETE FROM request_versions").update())
                .isInstanceOf(DataAccessException.class).hasMessageContaining("immutable");
    }
}
