package com.example.purchase;

import com.example.purchase.api.dto.AdminDtos.LoginInput;
import com.example.purchase.api.dto.AdminDtos.RegisterInput;
import com.example.purchase.application.AuthService;
import com.example.purchase.application.RequestQueryService;
import com.example.purchase.application.RequestSpecifications.ListFilter;
import com.example.purchase.api.dto.RequestDtos.RequestSummary;
import com.example.purchase.domain.*;
import com.example.purchase.persistence.UserEntity;
import com.example.purchase.security.LoginAttemptLimiter.LoginThrottledException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Security regression tests on a real PostgreSQL (docs/security/SECURITY-TEST-PLAN.md): authentication abuse,
 * the V7 database guards, and authorization × business-rule abuse cases not already covered by
 * {@link WorkflowIntegrationTest} (self-approval, duplicate approver, stale lock) and
 * {@link ConcurrencyIntegrationTest} (double approval, budget overdraw).
 */
@Testcontainers(disabledWithoutDocker = true)
class SecurityIntegrationTest extends IntegrationTest {

    private static final String PASSWORD = "Senha1234"; // set by IntegrationTest#user

    @Autowired AuthService auth;
    @Autowired JwtDecoder jwtDecoder;
    @Autowired RequestQueryService queries;

    private String emailOf(Actor actor) {
        return users.findById(actor.id()).map(UserEntity::getEmail).orElseThrow();
    }

    private static String freshClient() {
        return "198.51.100." + (int) (Math.random() * 250 + 1) + "-" + UUID.randomUUID(); // unique key per test
    }

    // ---------- authentication (SEC-F01, SEC-F05, SEC-F08) ----------

    @Test
    void issuedTokensCarryAudienceAndExpiryAndPassValidation() {
        var login = auth.login(new LoginInput(emailOf(owner), PASSWORD), freshClient());
        var jwt = jwtDecoder.decode(login.token());
        assertThat(jwt.getAudience()).containsExactly("purchase-requests-api");
        assertThat(jwt.getExpiresAt()).isNotNull();
        assertThat(jwt.getSubject()).isEqualTo(owner.id().toString());
        assertThat(login.user()).hasNoNullFieldsOrPropertiesExcept("approverLevel", "costCenterId");
    }

    @Test
    void repeatedWrongPasswordsLockTheAccountEvenForTheRightPassword() {
        String email = emailOf(owner);
        String client = freshClient();
        for (int i = 0; i < 5; i++) {
            assertThatThrownBy(() -> auth.login(new LoginInput(email, "Errada123"), client)).isInstanceOf(BadCredentialsException.class);
        }
        assertThatThrownBy(() -> auth.login(new LoginInput(email, PASSWORD), client)).isInstanceOf(LoginThrottledException.class);
        // other accounts are not affected
        assertThatCode(() -> auth.login(new LoginInput(emailOf(n1), PASSWORD), client)).doesNotThrowAnyException();
    }

    @Test
    void unknownEmailAndWrongPasswordFailIdentically() {
        assertThatThrownBy(() -> auth.login(new LoginInput("ninguem@test.local", PASSWORD), freshClient()))
                .isInstanceOf(BadCredentialsException.class).hasMessage("E-mail ou senha inválidos.");
        assertThatThrownBy(() -> auth.login(new LoginInput(emailOf(owner), "Errada123"), freshClient()))
                .isInstanceOf(BadCredentialsException.class).hasMessage("E-mail ou senha inválidos.");
    }

    @Test
    void passwordsLongerThanBcryptCanHashAreRejectedNotTruncatedOrA500() {
        String over72Bytes = "ã1".repeat(25); // 50 characters, 75 bytes
        assertThatThrownBy(() -> auth.register(new RegisterInput("novo@test.local", over72Bytes, "Novo Usuário", cc)))
                .isInstanceOf(DomainException.Invalid.class);
        assertThatThrownBy(() -> auth.login(new LoginInput(emailOf(owner), over72Bytes), freshClient()))
                .isInstanceOf(BadCredentialsException.class);
    }

    @Test
    void publicSignUpAlwaysCreatesASolicitante() {
        var created = auth.register(new RegisterInput("cadastro@test.local", "Senha1234", "Cadastro Público", cc));
        assertThat(created.role()).isEqualTo(Role.SOLICITANTE);
        assertThat(created.approverLevel()).isNull();
    }

    // ---------- database guards (V7: SEC-F06, SEC-F07) ----------

    @Test
    void emailUniquenessIsCaseInsensitiveInTheDatabase() {
        users.saveAndFlush(new UserEntity("Caixa@Test.Local", "x", "Primeiro", Role.SOLICITANTE, null, cc));
        assertThatThrownBy(() -> users.saveAndFlush(new UserEntity("caixa@test.local", "x", "Segundo", Role.SOLICITANTE, null, cc)))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void decidedApprovalStepsCannotBeRewrittenOrDeleted() {
        budget(cc, "50000.00");
        var r = createAndSubmit(owner, "Decisão imutável", Category.OTHER, "500.00");
        transitions.approve(n1, r.id(), r.lockVersion(), "Aprovado pelo N1.");

        assertThatThrownBy(() -> jdbc.sql("UPDATE approval_steps SET comment = 'reescrito' WHERE status = 'APPROVED'").update())
                .isInstanceOf(DataAccessException.class).hasMessageContaining("immutable");
        assertThatThrownBy(() -> jdbc.sql("UPDATE approval_steps SET approver_id = :id WHERE status = 'APPROVED'")
                .param("id", n2.id()).update())
                .isInstanceOf(DataAccessException.class).hasMessageContaining("immutable");
        assertThatThrownBy(() -> jdbc.sql("DELETE FROM approval_steps").update())
                .isInstanceOf(DataAccessException.class).hasMessageContaining("cannot be deleted");
    }

    // ---------- authorization × business rules ----------

    @Test
    void aSolicitanteCannotDecideEvenARequestTheyCanSee() {
        var r = createAndSubmit(owner, "Sem papel", Category.OTHER, "100.00");
        assertThatThrownBy(() -> transitions.approve(owner, r.id(), r.lockVersion(), null))
                .isInstanceOfSatisfying(DomainException.Forbidden.class, e -> assertThat(e.code()).isEqualTo(ErrorCode.FORBIDDEN));
    }

    @Test
    void anApproverOfAnotherCostCenterSeesNothingAndCannotDecide() {
        var otherCc = centers.save(new com.example.purchase.persistence.CostCenterEntity("CC-O-" + UUID.randomUUID().toString().substring(0, 6), "Outro")).getId();
        var foreignApprover = user(Role.APROVADOR, ApproverLevel.NIVEL_2, otherCc);
        var r = createAndSubmit(owner, "Outro centro", Category.OTHER, "100.00");

        assertThatThrownBy(() -> queries.detail(foreignApprover, r.id())).isInstanceOf(DomainException.NotFound.class);
        assertThatThrownBy(() -> transitions.approve(foreignApprover, r.id(), r.lockVersion(), null))
                .isInstanceOf(DomainException.NotFound.class); // 404, not 403: existence is not revealed (ADR-012)
    }

    @Test
    void anotherRequesterCannotReadEditSubmitOrCancelSomeoneElsesRequest() {
        var colleague = user(Role.SOLICITANTE, null, cc);
        var draft = requests.create(owner, input("Alheio", Category.OTHER, 1, "10.00"));
        assertThatThrownBy(() -> queries.detail(colleague, draft.id())).isInstanceOf(DomainException.NotFound.class);
        assertThatThrownBy(() -> transitions.submit(colleague, draft.id(), draft.lockVersion())).isInstanceOf(DomainException.NotFound.class);
        assertThatThrownBy(() -> transitions.cancel(colleague, draft.id(), draft.lockVersion())).isInstanceOf(DomainException.NotFound.class);
    }

    @Test
    void anApproverWhoCanSeeARequestStillCannotEditIt() {
        var r = createAndSubmit(owner, "Visível ao aprovador", Category.OTHER, "100.00");
        var update = new com.example.purchase.api.dto.RequestDtos.RequestUpdateInput("Alterado", null, Category.OTHER, null, null,
                List.of(new com.example.purchase.api.dto.RequestDtos.ItemInput("Item", 1, "1.00")), r.lockVersion());
        assertThatThrownBy(() -> requests.update(n1, r.id(), update))
                .isInstanceOfSatisfying(DomainException.Forbidden.class, e -> assertThat(e.code()).isEqualTo(ErrorCode.NOT_REQUEST_OWNER));
    }

    @Test
    void terminalRequestsCannotBeChangedOrDecidedAgainAndBudgetIsConsumedOnce() {
        budget(cc, "1000.00");
        var r = createAndSubmit(owner, "Final", Category.OTHER, "600.00");
        var approved = transitions.approve(n1, r.id(), r.lockVersion(), null);
        assertThat(approved.status()).isEqualTo(RequestStatus.APPROVED);

        assertThatThrownBy(() -> transitions.approve(admin1, approved.id(), approved.lockVersion(), null))
                .isInstanceOfSatisfying(DomainException.RuleViolation.class, e -> assertThat(e.code()).isEqualTo(ErrorCode.INVALID_TRANSITION));
        assertThatThrownBy(() -> transitions.cancel(owner, approved.id(), approved.lockVersion()))
                .isInstanceOfSatisfying(DomainException.RuleViolation.class, e -> assertThat(e.code()).isEqualTo(ErrorCode.INVALID_TRANSITION));
        assertThat(consumed(cc)).isEqualTo(Money.parse("600.00"));
    }

    @Test
    void theClientCannotChooseTheTotal() {
        // the input type has no total field; the server multiplies and sums in exact cents
        var draft = requests.create(owner, new com.example.purchase.api.dto.RequestDtos.RequestInput("Total", null, Category.OTHER, null, null,
                List.of(new com.example.purchase.api.dto.RequestDtos.ItemInput("A", 3, "0.10"),
                        new com.example.purchase.api.dto.RequestDtos.ItemInput("B", 7, "1999.99"))));
        assertThat(draft.total()).isEqualTo("14000.23");
    }

    // ---------- search (SEC-F09) ----------

    @Test
    void searchWildcardsMatchLiterally() {
        requests.create(owner, input("Desconto 50%", Category.OTHER, 1, "10.00"));
        requests.create(owner, input("Desconto 500", Category.OTHER, 1, "10.00"));
        var filter = new ListFilter(null, null, List.of(), null, null, null, null, "50%");
        assertThat(queries.list(owner, filter, 0, 20, null).data()).extracting(RequestSummary::title).containsExactly("Desconto 50%");
    }
}
