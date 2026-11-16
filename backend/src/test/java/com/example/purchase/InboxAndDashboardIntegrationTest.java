package com.example.purchase;

import com.example.purchase.api.dto.RequestDtos.BudgetLine;
import com.example.purchase.api.dto.RequestDtos.DashboardSummary;
import com.example.purchase.api.dto.RequestDtos.InboxItem;
import com.example.purchase.api.dto.RequestDtos.ItemInput;
import com.example.purchase.api.dto.RequestDtos.RequestDetail;
import com.example.purchase.api.dto.RequestDtos.RequestInput;
import com.example.purchase.api.dto.RequestDtos.StatusCount;
import com.example.purchase.application.DashboardService;
import com.example.purchase.application.InboxService;
import com.example.purchase.application.RequestQueryService;
import com.example.purchase.domain.Actor;
import com.example.purchase.domain.ApproverLevel;
import com.example.purchase.domain.Category;
import com.example.purchase.domain.DomainException;
import com.example.purchase.domain.ErrorCode;
import com.example.purchase.domain.RequestStatus;
import com.example.purchase.domain.Role;
import com.example.purchase.domain.StepLevel;
import com.example.purchase.persistence.CostCenterEntity;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Approval inbox (docs/RFs/RF-10) and dashboard (docs/RFs/RF-12) on a real PostgreSQL, plus the
 * segregation and "no eligible approver" cases they depend on (RF-07 CA-07.2, RF-06 RN-06.6).
 */
@Testcontainers(disabledWithoutDocker = true)
class InboxAndDashboardIntegrationTest extends IntegrationTest {

    @Autowired InboxService inbox;
    @Autowired DashboardService dashboard;
    @Autowired RequestQueryService queries;

    private UUID otherCc;
    private Actor otherN1;
    private Actor otherOwner;

    @BeforeEach
    void secondCostCenter() {
        otherCc = centers.save(new CostCenterEntity("CC-U-" + UUID.randomUUID().toString().substring(0, 6), "Outro")).getId();
        otherN1 = user(Role.APROVADOR, ApproverLevel.NIVEL_1, otherCc);
        otherOwner = user(Role.SOLICITANTE, null, otherCc);
    }

    private List<UUID> inboxIds(Actor actor) {
        return inbox.inbox(actor, null, 0, 100).data().stream().map(item -> item.summary().id()).toList();
    }

    /** A request in `cc` owned by an ADMIN (who has no cost center of their own). */
    private RequestDetail adminRequestAtAdminStep() {
        var draft = requests.create(admin1, new RequestInput("Servidor do admin", null, Category.EQUIPMENT, cc, null,
                List.of(new ItemInput("Servidor", 1, "15000.00"))));
        var r = transitions.submit(admin1, draft.id(), draft.lockVersion()); // > R$ 10.000 → N1, N2, ADMIN
        r = transitions.approve(n1, r.id(), r.lockVersion(), null);
        return transitions.approve(n2, r.id(), r.lockVersion(), null);
    }

    private static long count(DashboardSummary summary, RequestStatus status) {
        return summary.totals().stream().filter(t -> t.status() == status).mapToLong(StatusCount::count).sum();
    }

    private static BudgetLine line(DashboardSummary summary, UUID costCenterId) {
        return summary.budgets().stream().filter(b -> b.costCenterId().equals(costCenterId)).findFirst().orElseThrow();
    }

    // ---------- inbox (RF-10) ----------

    /** CA-10.1, CA-10.2, CA-10.3 and RN-10.5: level, cost center and "current step only". */
    @Test
    void eachApproverSeesOnlyTheCurrentStepsTheyMayDecideInTheirCenter() {
        var small = createAndSubmit(owner, "Mouse", Category.SUPPLIES, "500.00");          // [N1]
        var medium = createAndSubmit(owner, "Switch", Category.EQUIPMENT, "5000.00");      // [N1, N2]
        var atN2 = createAndSubmit(owner, "Roteador", Category.EQUIPMENT, "4000.00");      // [N1, N2] → moved to N2
        var otherCenter = createAndSubmit(otherOwner, "Cadeira", Category.OTHER, "300.00"); // other center, N1
        transitions.approve(n1, atN2.id(), atN2.lockVersion(), null);

        assertThat(inboxIds(n1)).containsExactlyInAnyOrder(small.id(), medium.id());               // N2 step is not theirs
        assertThat(inboxIds(n2)).containsExactlyInAnyOrder(small.id(), medium.id(), atN2.id());   // NIVEL_2 also gets N1 steps
        assertThat(inboxIds(otherN1)).containsExactly(otherCenter.id());
        assertThat(inboxIds(admin1)).contains(small.id(), medium.id(), atN2.id(), otherCenter.id()); // ADMIN: every center

        var item = inbox.inbox(n2, null, 0, 100).data().stream().filter(i -> i.summary().id().equals(atN2.id())).findFirst().orElseThrow();
        assertThat(item.currentStep().level()).isEqualTo(StepLevel.NIVEL_2);
        assertThat(inboxIds(n2)).doesNotContain(createAndSubmit(n2, "Pedido do N2", Category.OTHER, "100.00").id()); // own request
    }

    /** CA-10.4 and RN-10.2: after approving a step, the same person no longer sees the request. */
    @Test
    void segregationRemovesARequestFromTheInboxOfWhoAlreadyApproved() {
        var r = createAndSubmit(owner, "Switch", Category.EQUIPMENT, "5000.00");
        assertThat(inboxIds(n2)).contains(r.id());
        transitions.approve(n2, r.id(), r.lockVersion(), null); // N2 decides the N1 step…
        assertThat(inboxIds(n2)).doesNotContain(r.id());        // …so cannot decide the N2 step of this version
    }

    /** CA-10.5 and RF-07 CA-07.2: an ADMIN never decides their own request; the other ADMIN does. */
    @Test
    void anAdminOwnedRequestAtTheAdminStepGoesToTheOtherAdminOnly() {
        var r = adminRequestAtAdminStep();
        assertThat(inboxIds(admin1)).doesNotContain(r.id());
        assertThat(inboxIds(admin2)).contains(r.id());
        assertThatThrownBy(() -> transitions.approve(admin1, r.id(), r.lockVersion(), null))
                .isInstanceOfSatisfying(DomainException.RuleViolation.class, e -> assertThat(e.code()).isEqualTo(ErrorCode.SELF_APPROVAL_FORBIDDEN));
    }

    /** CA-10.6 and RF-06 RN-06.6: a step nobody present may decide just stays pending; nothing fails. */
    @Test
    void aStepWithoutAnEligibleApproverStaysPendingWithoutError() {
        var r = adminRequestAtAdminStep();
        for (var ineligible : List.of(admin1, n1, n2, otherN1)) {
            assertThat(inboxIds(ineligible)).doesNotContain(r.id());
        }
        var reloaded = queries.detail(admin1, r.id());
        assertThat(reloaded.status()).isEqualTo(RequestStatus.PENDING_APPROVAL);
        assertThat(reloaded.steps().get(2).level()).isEqualTo(StepLevel.ADMIN);
    }

    /** RN-10.6 and RN-10.7: optional cost-center filter; a SOLICITANTE has no inbox. */
    @Test
    void theCostCenterFilterNarrowsTheInboxAndASolicitanteHasNone() {
        var mine = createAndSubmit(owner, "Mouse", Category.SUPPLIES, "500.00");
        var other = createAndSubmit(otherOwner, "Cadeira", Category.OTHER, "300.00");
        List<InboxItem> filtered = inbox.inbox(admin1, otherCc, 0, 100).data();
        assertThat(filtered).extracting(i -> i.summary().id()).containsExactly(other.id()).doesNotContain(mine.id());

        assertThatThrownBy(() -> inbox.inbox(owner, null, 0, 20))
                .isInstanceOfSatisfying(DomainException.Forbidden.class, e -> assertThat(e.code()).isEqualTo(ErrorCode.FORBIDDEN));
    }

    // ---------- dashboard (RF-12) ----------

    /** CA-12.1, CA-12.2, CA-12.3 and RN-12.1: totals follow the caller's visibility; drafts count only for their owner. */
    @Test
    void totalsByStatusFollowTheCallersVisibility() {
        requests.create(owner, input("Rascunho do dono", Category.OTHER, 1, "10.00"));
        createAndSubmit(owner, "Mouse", Category.SUPPLIES, "500.00");
        createAndSubmit(otherOwner, "Cadeira", Category.OTHER, "300.00");

        var ownerView = dashboard.summary(owner);
        assertThat(count(ownerView, RequestStatus.DRAFT)).isEqualTo(1);
        assertThat(count(ownerView, RequestStatus.PENDING_APPROVAL)).isEqualTo(1);

        var adminView = dashboard.summary(admin1);
        assertThat(count(adminView, RequestStatus.DRAFT)).isZero(); // drafts are owner-only, ADMIN included
        assertThat(count(adminView, RequestStatus.PENDING_APPROVAL)).isEqualTo(2);

        var approverView = dashboard.summary(n1);
        assertThat(count(approverView, RequestStatus.DRAFT)).isZero();
        assertThat(count(approverView, RequestStatus.PENDING_APPROVAL)).isEqualTo(1); // own center only
        assertThat(approverView.totals()).hasSize(RequestStatus.values().length);   // every status is listed
    }

    /** CA-12.4, CA-12.5, RN-12.2 and RN-12.3: current-month budget per center, in the caller's scope. */
    @Test
    void budgetsShowAmountConsumedAndAvailableInTheCallersScope() {
        budget(cc, "50000.00");
        var r = createAndSubmit(owner, "Teclados", Category.SUPPLIES, "600.00");
        transitions.approve(n1, r.id(), r.lockVersion(), null);

        var adminView = dashboard.summary(admin1);
        var ccLine = line(adminView, cc);
        assertThat(ccLine.month()).isEqualTo(calendar.currentMonth());
        assertThat(ccLine.amount()).isEqualTo("50000.00");
        assertThat(ccLine.consumed()).isEqualTo("600.00");
        assertThat(ccLine.available()).isEqualTo("49400.00");
        var otherLine = line(adminView, otherCc); // no budget registered this month → zeros
        assertThat(List.of(otherLine.amount(), otherLine.consumed(), otherLine.available())).containsOnly("0.00");

        assertThat(dashboard.summary(owner).budgets()).extracting(BudgetLine::costCenterId).containsExactly(cc);
        assertThat(dashboard.summary(otherN1).budgets()).extracting(BudgetLine::costCenterId).containsExactly(otherCc);
    }

    /** RN-12.4: average approval time is null without decisions and counts decisions of the last 30 days. */
    @Test
    void averageApprovalTimeIsNullWithoutDecisionsAndFilledAfterOne() {
        budget(cc, "50000.00");
        var r = createAndSubmit(owner, "Teclados", Category.SUPPLIES, "600.00");
        assertThat(dashboard.summary(admin1).averageApprovalTimeDays()).isNull();

        transitions.approve(n1, r.id(), r.lockVersion(), null); // decided seconds after submission
        assertThat(dashboard.summary(admin1).averageApprovalTimeDays()).isEqualTo(0.0);
        assertThat(dashboard.summary(otherN1).averageApprovalTimeDays()).isNull(); // outside that approver's visibility
    }
}
