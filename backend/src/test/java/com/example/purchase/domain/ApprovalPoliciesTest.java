package com.example.purchase.domain;

import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.assertThatNoException;

class ApprovalPoliciesTest {

    static final UUID CC_A = UUID.randomUUID();
    static final UUID CC_B = UUID.randomUUID();

    static Actor actor(Role role, ApproverLevel level, UUID cc) {
        return new Actor(UUID.randomUUID(), role.name(), role, level, cc);
    }

    @Nested
    class Eligibility {

        /** README §2.3 rule 2, for an approver of CC_A deciding a step of a CC_A (same) or CC_B (other) version. */
        @ParameterizedTest(name = "{0} {1} on {2} step, same center={3} → {4}")
        @CsvSource({
                "APROVADOR, NIVEL_1, NIVEL_1, true,  true",
                "APROVADOR, NIVEL_2, NIVEL_1, true,  true",   // N2 can also approve N1 steps
                "APROVADOR, NIVEL_1, NIVEL_2, true,  false",
                "APROVADOR, NIVEL_2, NIVEL_2, true,  true",
                "APROVADOR, NIVEL_2, ADMIN,   true,  false",
                "APROVADOR, NIVEL_1, NIVEL_1, false, false",  // other cost center
                "APROVADOR, NIVEL_2, NIVEL_2, false, false",
                "ADMIN,     ,        NIVEL_1, false, true",   // ADMIN approves any level, any center
                "ADMIN,     ,        NIVEL_2, false, true",
                "ADMIN,     ,        ADMIN,   false, true",
                "SOLICITANTE, ,      NIVEL_1, true,  false",
        })
        void matrix(Role role, ApproverLevel level, StepLevel step, boolean sameCenter, boolean expected) {
            var approver = actor(role, level, role == Role.ADMIN ? null : CC_A);
            assertThat(ApprovalPolicies.isEligible(approver, step, sameCenter ? CC_A : CC_B)).isEqualTo(expected);
        }

        @Test
        void rejectionExplainsWhoMayApprove() {
            var n1 = actor(Role.APROVADOR, ApproverLevel.NIVEL_1, CC_A);
            assertThatThrownBy(() -> ApprovalPolicies.requireEligible(n1, StepLevel.NIVEL_2, CC_A, "CC-TI-01"))
                    .isInstanceOfSatisfying(DomainException.RuleViolation.class, e -> {
                        assertThat(e.code()).isEqualTo(ErrorCode.APPROVER_NOT_ELIGIBLE);
                        assertThat(e.detail()).contains("NIVEL_2").contains("CC-TI-01");
                    });
        }
    }

    @Nested
    class Segregation {

        final Actor approver = actor(Role.APROVADOR, ApproverLevel.NIVEL_2, CC_A);

        @Test
        void nobodyApprovesTheirOwnRequest() {
            assertThat(ApprovalPolicies.segregationViolation(approver, approver.id(), List.of()))
                    .contains(ErrorCode.SELF_APPROVAL_FORBIDDEN);
        }

        @Test
        void theSamePersonCannotApproveTwoStepsOfTheSameVersion() {
            var chain = List.of(
                    new StepState(1, StepLevel.NIVEL_1, StepStatus.APPROVED, approver.id()),
                    new StepState(2, StepLevel.NIVEL_2, StepStatus.PENDING, null));
            assertThatThrownBy(() -> ApprovalPolicies.requireSegregation(approver, UUID.randomUUID(), chain))
                    .isInstanceOfSatisfying(DomainException.RuleViolation.class, e -> {
                        assertThat(e.code()).isEqualTo(ErrorCode.DUPLICATE_APPROVER);
                        assertThat(e.detail()).isEqualTo("Não é possível decidir: você já aprovou a etapa NIVEL_1 desta versão (segregação de funções).");
                    });
        }

        @Test
        void aNewVersionStartsClean() {
            // the v2 chain has no approvals yet — what this person did on v1 does not count
            var v2 = List.of(new StepState(1, StepLevel.NIVEL_1, StepStatus.PENDING, null));
            assertThat(ApprovalPolicies.segregationViolation(approver, UUID.randomUUID(), v2)).isEmpty();
        }
    }

    @Nested
    class Comment {

        @Test
        void optionalOnApprove() {
            assertThatNoException().isThrownBy(() -> ApprovalPolicies.requireComment(Action.APPROVE, null));
            assertThatNoException().isThrownBy(() -> ApprovalPolicies.requireComment(Action.APPROVE, "OK"));
        }

        @ParameterizedTest
        @CsvSource({"REJECT", "REQUEST_CHANGES"})
        void atLeastTenCharactersOnRejectAndReturn(Action action) {
            assertThatThrownBy(() -> ApprovalPolicies.requireComment(action, "   curto   "))
                    .isInstanceOfSatisfying(DomainException.RuleViolation.class, e -> assertThat(e.code()).isEqualTo(ErrorCode.COMMENT_REQUIRED));
            assertThatNoException().isThrownBy(() -> ApprovalPolicies.requireComment(action, "Fora do orçamento previsto."));
        }
    }
}
