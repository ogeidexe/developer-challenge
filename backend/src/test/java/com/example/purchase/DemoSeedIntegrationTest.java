package com.example.purchase;

import com.example.purchase.api.dto.AdminDtos.LoginInput;
import com.example.purchase.application.AuthService;
import com.example.purchase.config.DemoSeed;
import com.example.purchase.domain.BusinessCalendar;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The README §5.4 demo seed (docs/RFs/RNF-08) on a real PostgreSQL. Not an {@link IntegrationTest}: that base
 * truncates every table, while this context starts with `app.seed.enabled=true` (own context, own database)
 * and asserts what the startup created.
 */
@SpringBootTest
@Import(TestcontainersConfiguration.class)
@Testcontainers(disabledWithoutDocker = true)
@TestPropertySource(properties = {
        "app.seed.enabled=true",
        "app.jwt.secret=integration-test-secret-at-least-32-bytes!!"
})
class DemoSeedIntegrationTest {

    @Autowired JdbcClient jdbc;
    @Autowired DemoSeed seed;
    @Autowired AuthService auth;
    @Autowired BusinessCalendar calendar;

    private long count(String sql, Object... params) {
        var statement = jdbc.sql(sql);
        for (int i = 0; i < params.length; i++) statement = statement.param(i + 1, params[i]);
        return statement.query(Long.class).single();
    }

    private long usersIn(String centerCode, String role, String level) {
        return count("""
                SELECT count(*) FROM users u JOIN cost_centers c ON c.id = u.cost_center_id
                WHERE c.code = ? AND u.role = ? AND u.approver_level IS NOT DISTINCT FROM ?
                """, centerCode, role, level);
    }

    private String statusOf(String title) {
        return jdbc.sql("SELECT status FROM purchase_requests WHERE title = ?").param(1, title).query(String.class).single();
    }

    /** CA-R08.1, RN-R08.1, RN-R08.2, RN-R08.3: two centers, three users per center, two global admins. */
    @Test
    void createsTheDocumentedCast() {
        assertThat(jdbc.sql("SELECT code FROM cost_centers ORDER BY code").query(String.class).list())
                .containsExactly("CC-ADM-02", "CC-TI-01");
        for (String center : List.of("CC-TI-01", "CC-ADM-02")) {
            assertThat(usersIn(center, "SOLICITANTE", null)).as(center + " SOLICITANTE").isEqualTo(1);
            assertThat(usersIn(center, "APROVADOR", "NIVEL_1")).as(center + " NIVEL_1").isEqualTo(1);
            assertThat(usersIn(center, "APROVADOR", "NIVEL_2")).as(center + " NIVEL_2").isEqualTo(1);
        }
        assertThat(count("SELECT count(*) FROM users WHERE role = 'ADMIN' AND cost_center_id IS NULL")).isEqualTo(2);
        assertThat(count("SELECT count(*) FROM users")).isEqualTo(8);

        // RN-R08.6: every demo user signs in with the documented password
        for (String email : List.of("admin1@kingspan.test", "admin2@kingspan.test", "solic.ti@kingspan.test", "aprov1.ti@kingspan.test",
                "aprov2.ti@kingspan.test", "solic.adm@kingspan.test", "aprov1.adm@kingspan.test", "aprov2.adm@kingspan.test")) {
            assertThat(auth.login(new LoginInput(email, "Kingspan@123"), "seed-test").token()).as(email).isNotBlank();
        }
    }

    /** CA-R08.2 and RN-R08.1: CC-TI-01 is almost exhausted this month (R$ 800,00 left), from a real approval. */
    @Test
    void leavesCcTi01AlmostExhaustedThroughARealApproval() {
        var budget = jdbc.sql("""
                SELECT b.amount_cents, b.consumed_cents FROM budgets b JOIN cost_centers c ON c.id = b.cost_center_id
                WHERE c.code = 'CC-TI-01' AND b.year_month = ?
                """).param(1, calendar.currentMonth()).query().singleRow();
        assertThat(((Number) budget.get("amount_cents")).longValue()).isEqualTo(5_000_000L);
        assertThat(((Number) budget.get("consumed_cents")).longValue()).isEqualTo(4_920_000L);
        assertThat(statusOf("Servidor virtualização")).isEqualTo("APPROVED");
    }

    /** RN-R08.4: requests in varied states, created through the services (with history, versions and steps). */
    @Test
    void createsRequestsInEveryStateThroughTheServices() {
        Map<String, String> expected = Map.of(
                "Monitores para o time de suporte", "DRAFT",
                "Kit periféricos estoque", "PENDING_APPROVAL",
                "Antivírus corporativo", "CHANGES_REQUESTED",
                "Servidor virtualização", "APPROVED",
                "Drone inspeção", "REJECTED",
                "Projetor multimídia", "CANCELLED",
                "Notebooks para o time de TI", "PENDING_APPROVAL");
        expected.forEach((title, status) -> assertThat(statusOf(title)).as(title).isEqualTo(status));
        assertThat(count("SELECT count(DISTINCT status) FROM purchase_requests")).isEqualTo(6); // all six states
        assertThat(count("SELECT count(*) FROM request_events")).isGreaterThan(count("SELECT count(*) FROM purchase_requests"));
        assertThat(count("SELECT count(*) FROM request_versions")).isPositive();
    }

    /** CA-R08.3 and RN-R08.5: running the seed again (a restart) creates nothing new. */
    @Test
    void runningTheSeedAgainDuplicatesNothing() {
        long usersBefore = count("SELECT count(*) FROM users");
        long requestsBefore = count("SELECT count(*) FROM purchase_requests");
        long eventsBefore = count("SELECT count(*) FROM request_events");

        seed.run(null);

        assertThat(count("SELECT count(*) FROM users")).isEqualTo(usersBefore);
        assertThat(count("SELECT count(*) FROM purchase_requests")).isEqualTo(requestsBefore);
        assertThat(count("SELECT count(*) FROM request_events")).isEqualTo(eventsBefore);
    }
}
