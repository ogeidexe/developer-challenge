package com.example.purchase;

import com.example.purchase.api.dto.RequestDtos.ItemInput;
import com.example.purchase.api.dto.RequestDtos.RequestDetail;
import com.example.purchase.api.dto.RequestDtos.RequestInput;
import com.example.purchase.application.PurchaseRequestService;
import com.example.purchase.application.TransitionFacade;
import com.example.purchase.domain.*;
import com.example.purchase.persistence.*;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.List;
import java.util.UUID;

/**
 * Base for tests against a real PostgreSQL (README §5.2). They call the application services directly with an
 * {@link Actor}, exactly as the controllers do after authentication. Skipped (not failed) without Docker.
 */
@SpringBootTest
@Import(TestcontainersConfiguration.class)
@Testcontainers(disabledWithoutDocker = true)
@TestPropertySource(properties = {
        "app.seed.enabled=false",
        "app.jwt.secret=integration-test-secret-at-least-32-bytes!!"
})
public abstract class IntegrationTest {

    @Autowired protected PurchaseRequestService requests;
    @Autowired protected TransitionFacade transitions;
    @Autowired protected UserRepository users;
    @Autowired protected CostCenterRepository centers;
    @Autowired protected BudgetRepository budgets;
    @Autowired protected BusinessCalendar calendar;
    @Autowired protected JdbcClient jdbc;
    @Autowired private PasswordEncoder passwords;

    protected UUID cc;
    protected Actor owner;
    protected Actor n1;
    protected Actor n2;
    protected Actor admin1;
    protected Actor admin2;

    /** TRUNCATE is not blocked by the row-level immutability triggers, so each test starts from an empty schema. */
    @BeforeEach
    void resetDatabaseAndCreateCast() {
        jdbc.sql("""
                TRUNCATE request_events, approval_steps, version_items, request_versions, request_items,
                         purchase_requests, idempotency_keys, budgets, users, cost_centers RESTART IDENTITY CASCADE
                """).update();
        cc = centers.save(new CostCenterEntity("CC-T-" + UUID.randomUUID().toString().substring(0, 6), "Teste")).getId();
        owner = user(Role.SOLICITANTE, null, cc);
        n1 = user(Role.APROVADOR, ApproverLevel.NIVEL_1, cc);
        n2 = user(Role.APROVADOR, ApproverLevel.NIVEL_2, cc);
        admin1 = user(Role.ADMIN, null, null);
        admin2 = user(Role.ADMIN, null, null);
    }

    protected Actor user(Role role, ApproverLevel level, UUID costCenterId) {
        String email = role.name().toLowerCase() + "." + UUID.randomUUID() + "@test.local";
        return users.save(new UserEntity(email, passwords.encode("Senha1234"), role + " user", role, level, costCenterId)).toActor();
    }

    protected void budget(UUID costCenterId, String amount) {
        budgets.save(new BudgetEntity(costCenterId, calendar.currentMonth(), Money.parse(amount)));
    }

    protected Money consumed(UUID costCenterId) {
        return budgets.findByCostCenterIdAndYearMonth(costCenterId, calendar.currentMonth()).orElseThrow().getConsumed();
    }

    protected static RequestInput input(String title, Category category, int quantity, String unitPrice) {
        return new RequestInput(title, null, category, null, null, List.of(new ItemInput("Item de " + title, quantity, unitPrice)));
    }

    protected RequestDetail createAndSubmit(Actor requester, String title, Category category, String total) {
        var draft = requests.create(requester, input(title, category, 1, total));
        return transitions.submit(requester, draft.id(), draft.lockVersion());
    }
}
