package com.example.purchase.domain;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.UUID;

import static com.example.purchase.domain.AllowedAction.*;
import static org.assertj.core.api.Assertions.assertThat;

class AccessPolicyTest {

    final UUID ccA = UUID.randomUUID();
    final Actor owner = new Actor(UUID.randomUUID(), "Owner", Role.SOLICITANTE, null, ccA);
    final Actor n1 = new Actor(UUID.randomUUID(), "N1", Role.APROVADOR, ApproverLevel.NIVEL_1, ccA);
    final Actor otherCenterN2 = new Actor(UUID.randomUUID(), "N2-B", Role.APROVADOR, ApproverLevel.NIVEL_2, UUID.randomUUID());
    final Actor admin = new Actor(UUID.randomUUID(), "Admin", Role.ADMIN, null, null);

    @Test
    void draftsAreVisibleToTheOwnerOnlyAdminIncluded() {
        assertThat(AccessPolicy.canSee(owner, owner.id(), ccA, RequestStatus.DRAFT)).isTrue();
        assertThat(AccessPolicy.canSee(n1, owner.id(), ccA, RequestStatus.DRAFT)).isFalse();
        assertThat(AccessPolicy.canSee(admin, owner.id(), ccA, RequestStatus.DRAFT)).isFalse();
    }

    @Test
    void approversSeeTheirCenterAdminSeesEverythingElse() {
        assertThat(AccessPolicy.canSee(n1, owner.id(), ccA, RequestStatus.PENDING_APPROVAL)).isTrue();
        assertThat(AccessPolicy.canSee(otherCenterN2, owner.id(), ccA, RequestStatus.PENDING_APPROVAL)).isFalse();
        assertThat(AccessPolicy.canSee(admin, owner.id(), ccA, RequestStatus.APPROVED)).isTrue();
        var anotherRequester = new Actor(UUID.randomUUID(), "X", Role.SOLICITANTE, null, ccA);
        assertThat(AccessPolicy.canSee(anotherRequester, owner.id(), ccA, RequestStatus.PENDING_APPROVAL)).isFalse();
    }

    @Test
    void allowedActionsPerCaller() {
        var pendingAtN1 = new AccessPolicy.RequestView(owner.id(), RequestStatus.PENDING_APPROVAL, ccA,
                List.of(new StepState(1, StepLevel.NIVEL_1, StepStatus.PENDING, null)));

        assertThat(AccessPolicy.allowedActions(owner, pendingAtN1)).containsExactly(CANCEL);
        assertThat(AccessPolicy.allowedActions(n1, pendingAtN1)).containsExactlyInAnyOrder(APPROVE, REJECT, REQUEST_CHANGES);
        assertThat(AccessPolicy.allowedActions(admin, pendingAtN1)).containsExactlyInAnyOrder(CANCEL, APPROVE, REJECT, REQUEST_CHANGES);
        assertThat(AccessPolicy.allowedActions(otherCenterN2, pendingAtN1)).isEmpty();

        var draft = new AccessPolicy.RequestView(owner.id(), RequestStatus.DRAFT, ccA, List.of());
        assertThat(AccessPolicy.allowedActions(owner, draft)).containsExactlyInAnyOrder(EDIT, SUBMIT, CANCEL);

        var approved = new AccessPolicy.RequestView(owner.id(), RequestStatus.APPROVED, ccA, List.of());
        assertThat(AccessPolicy.allowedActions(admin, approved)).isEmpty();
    }

    @Test
    void anApproverWhoAlreadyDecidedAStepGetsNoDecisionButtons() {
        var pendingAtN2 = new AccessPolicy.RequestView(owner.id(), RequestStatus.PENDING_APPROVAL, ccA, List.of(
                new StepState(1, StepLevel.NIVEL_1, StepStatus.APPROVED, admin.id()),
                new StepState(2, StepLevel.NIVEL_2, StepStatus.PENDING, null)));
        assertThat(AccessPolicy.allowedActions(admin, pendingAtN2)).containsExactly(CANCEL);
    }
}
