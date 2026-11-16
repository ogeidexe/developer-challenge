package com.example.purchase;

import com.example.purchase.api.dto.AdminDtos.CreateCostCenterInput;
import com.example.purchase.api.dto.AdminDtos.CreateUserInput;
import com.example.purchase.api.dto.AdminDtos.UpdateUserInput;
import com.example.purchase.application.CostCenterService;
import com.example.purchase.application.UserAdminService;
import com.example.purchase.domain.Actor;
import com.example.purchase.domain.ApproverLevel;
import com.example.purchase.domain.Category;
import com.example.purchase.domain.DomainException;
import com.example.purchase.domain.ErrorCode;
import com.example.purchase.domain.Money;
import com.example.purchase.domain.RequestStatus;
import com.example.purchase.domain.Role;
import com.example.purchase.persistence.UserEntity;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Administration on a real PostgreSQL: users and roles (docs/RFs/RF-02) and the monthly budget PUT
 * (docs/RFs/RF-08, CA-08.5). Each test names the acceptance criterion it covers.
 */
@Testcontainers(disabledWithoutDocker = true)
class AdminServicesIntegrationTest extends IntegrationTest {

    @Autowired UserAdminService userAdmin;
    @Autowired CostCenterService costCenters;

    private UserEntity reload(UUID id) {
        return users.findById(id).orElseThrow();
    }

    /** CA-02.1 and RN-02.6: only ADMIN manages users, cost centers and budgets. */
    @Test
    void onlyAdminManagesUsersCostCentersAndBudgets() {
        var newUser = new CreateUserInput("novo." + UUID.randomUUID() + "@test.local", "Senha1234", "Novo", Role.SOLICITANTE, null, cc);
        for (var caller : new Actor[] {owner, n1, n2}) {
            assertThatThrownBy(() -> userAdmin.list(caller, null, null, null, 0, 20))
                    .isInstanceOfSatisfying(DomainException.Forbidden.class, e -> assertThat(e.code()).isEqualTo(ErrorCode.FORBIDDEN));
            assertThatThrownBy(() -> userAdmin.create(caller, newUser))
                    .isInstanceOfSatisfying(DomainException.Forbidden.class, e -> assertThat(e.code()).isEqualTo(ErrorCode.FORBIDDEN));
            assertThatThrownBy(() -> costCenters.create(caller, new CreateCostCenterInput("CC-X-" + UUID.randomUUID().toString().substring(0, 4), "X")))
                    .isInstanceOfSatisfying(DomainException.Forbidden.class, e -> assertThat(e.code()).isEqualTo(ErrorCode.FORBIDDEN));
            assertThatThrownBy(() -> costCenters.setBudget(caller, cc, calendar.currentMonth(), Money.parse("1000.00")))
                    .isInstanceOfSatisfying(DomainException.Forbidden.class, e -> assertThat(e.code()).isEqualTo(ErrorCode.FORBIDDEN));
        }
        assertThat(userAdmin.list(admin1, null, null, null, 0, 20).totalElements()).isEqualTo(5L);
        assertThat(userAdmin.create(admin1, newUser).role()).isEqualTo(Role.SOLICITANTE);
    }

    /** CA-02.2 and RN-02.2: the profile rules are checked per field. */
    @Test
    void approverNeedsALevelAndOnlyAdminIsGlobal() {
        String email = "aprov." + UUID.randomUUID() + "@test.local";
        assertThatThrownBy(() -> userAdmin.create(admin1, new CreateUserInput(email, "Senha1234", "Aprov", Role.APROVADOR, null, cc)))
                .isInstanceOfSatisfying(DomainException.Invalid.class, e -> {
                    assertThat(e.code()).isEqualTo(ErrorCode.VALIDATION_FAILED);
                    assertThat(e.errors()).extracting(DomainException.FieldError::field).containsExactly("approverLevel");
                });
        assertThatThrownBy(() -> userAdmin.create(admin1, new CreateUserInput(email, "Senha1234", "Solic", Role.SOLICITANTE, null, null)))
                .isInstanceOfSatisfying(DomainException.Invalid.class,
                        e -> assertThat(e.errors()).extracting(DomainException.FieldError::field).containsExactly("costCenterId"));
        assertThatThrownBy(() -> userAdmin.create(admin1, new CreateUserInput(email, "Senha1234", "Solic", Role.SOLICITANTE, ApproverLevel.NIVEL_1, cc)))
                .isInstanceOfSatisfying(DomainException.Invalid.class,
                        e -> assertThat(e.errors()).extracting(DomainException.FieldError::field).containsExactly("approverLevel"));

        var created = userAdmin.create(admin1, new CreateUserInput(email, "Senha1234", "Aprov", Role.APROVADOR, ApproverLevel.NIVEL_2, cc));
        assertThat(created.approverLevel()).isEqualTo(ApproverLevel.NIVEL_2);
        assertThat(created.costCenterId()).isEqualTo(cc);
    }

    /** CA-02.3: a promotion is stored at once; the next request of that user is authorized with the new role. */
    @Test
    void promotingAUserChangesTheRoleUsedFromTheNextRequest() {
        int lock = reload(owner.id()).getLockVersion();
        userAdmin.update(admin1, owner.id(), new UpdateUserInput(null, Role.APROVADOR, ApproverLevel.NIVEL_1, null, null, lock));

        var promoted = reload(owner.id()).toActor(); // what CurrentUser loads on the next authenticated request
        assertThat(promoted.role()).isEqualTo(Role.APROVADOR);
        assertThat(promoted.approverLevel()).isEqualTo(ApproverLevel.NIVEL_1);

        // demoting away from APROVADOR drops the level
        int lock2 = reload(owner.id()).getLockVersion();
        userAdmin.update(admin1, owner.id(), new UpdateUserInput(null, Role.SOLICITANTE, null, null, null, lock2));
        assertThat(reload(owner.id()).getApproverLevel()).isNull();
    }

    /** CA-02.4: e-mail uniqueness ignores case at the service too (not only in the database). */
    @Test
    void anExistingEmailInAnotherCaseIsAConflict() {
        String existing = reload(owner.id()).getEmail().toUpperCase();
        assertThatThrownBy(() -> userAdmin.create(admin1, new CreateUserInput(existing, "Senha1234", "Dup", Role.SOLICITANTE, null, cc)))
                .isInstanceOfSatisfying(DomainException.Conflict.class, e -> assertThat(e.code()).isEqualTo(ErrorCode.EMAIL_ALREADY_REGISTERED));
    }

    /** CA-02.5: a cost center code is unique. */
    @Test
    void aDuplicateCostCenterCodeIsAConflict() {
        String code = "CC-D-" + UUID.randomUUID().toString().substring(0, 4);
        costCenters.create(admin1, new CreateCostCenterInput(code, "Primeiro"));
        assertThatThrownBy(() -> costCenters.create(admin1, new CreateCostCenterInput(code, "Segundo")))
                .isInstanceOfSatisfying(DomainException.Conflict.class, e -> assertThat(e.code()).isEqualTo(ErrorCode.CODE_ALREADY_USED));
    }

    /** CA-02.6: editing a user with a stale lockVersion is a 409 and changes nothing. */
    @Test
    void editingAUserWithAStaleLockVersionIsAConflict() {
        int current = reload(owner.id()).getLockVersion();
        assertThatThrownBy(() -> userAdmin.update(admin1, owner.id(), new UpdateUserInput("Outro nome", null, null, null, null, current + 5)))
                .isInstanceOfSatisfying(DomainException.Conflict.class, e -> {
                    assertThat(e.code()).isEqualTo(ErrorCode.CONCURRENCY_CONFLICT);
                    assertThat(e.currentLockVersion()).isEqualTo(current);
                });
        assertThat(reload(owner.id()).getName()).isNotEqualTo("Outro nome");
    }

    /** CA-08.5 and RN-08.7: a budget cannot go below what the month already consumed; the month format is checked. */
    @Test
    void aBudgetBelowTheConsumedAmountIsRefused() {
        String month = calendar.currentMonth();
        budget(cc, "1000.00");
        var request = createAndSubmit(owner, "Teclados", Category.SUPPLIES, "600.00"); // ≤ R$ 1.000 → NIVEL_1 only
        assertThat(transitions.approve(n1, request.id(), request.lockVersion(), null).status()).isEqualTo(RequestStatus.APPROVED);
        assertThat(consumed(cc)).isEqualTo(Money.parse("600.00"));

        assertThatThrownBy(() -> costCenters.setBudget(admin1, cc, month, Money.parse("599.99")))
                .isInstanceOfSatisfying(DomainException.RuleViolation.class, e -> {
                    assertThat(e.code()).isEqualTo(ErrorCode.BUDGET_BELOW_CONSUMED);
                    assertThat(e.detail()).contains(month);
                });
        var exact = costCenters.setBudget(admin1, cc, month, Money.parse("600.00")); // equal to consumed is allowed
        assertThat(exact.available()).isEqualTo("0.00");

        assertThatThrownBy(() -> costCenters.setBudget(admin1, cc, "2026-13", Money.parse("10.00")))
                .isInstanceOfSatisfying(DomainException.Invalid.class, e -> assertThat(e.code()).isEqualTo(ErrorCode.INVALID_MONTH_FORMAT));
        assertThat(costCenters.getBudget(cc, "1999-01").amount()).isEqualTo("0.00"); // month without budget = zero
    }
}
