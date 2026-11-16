package com.example.purchase;

import com.example.purchase.api.dto.AdminDtos.UpdateUserInput;
import com.example.purchase.application.UserAdminService;
import com.example.purchase.domain.Actor;
import com.example.purchase.domain.ApproverLevel;
import com.example.purchase.domain.Role;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.testcontainers.junit.jupiter.Testcontainers;
import tools.jackson.databind.json.JsonMapper;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpRequest.BodyPublishers;
import java.net.http.HttpResponse;
import java.net.http.HttpResponse.BodyHandlers;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The HTTP contract with a real server and PostgreSQL: what only exists in the web layer — `GET /auth/me`
 * (RF-01 CA-01.6), problem+json errors (RNF-01), the X-Request-Id filter and its storage in the history
 * (RNF-04, RF-11 CA-11.3), 401/403/404, and a role change seen by an already-issued token (RF-02 CA-02.3).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Testcontainers(disabledWithoutDocker = true)
class HttpContractIntegrationTest extends IntegrationTest {

    private static final String UUID_PATTERN = "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$";

    @Value("${local.server.port}") int port;
    @Autowired JsonMapper json;
    @Autowired UserAdminService userAdmin;

    private final HttpClient http = HttpClient.newHttpClient();

    private HttpResponse<String> call(String method, String path, String token, String requestId, Object body) throws Exception {
        var builder = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path));
        if (token != null) builder.header("Authorization", "Bearer " + token);
        if (requestId != null) builder.header("X-Request-Id", requestId);
        if (body != null) {
            builder.header("Content-Type", "application/json").method(method, BodyPublishers.ofString(json.writeValueAsString(body)));
        } else {
            builder.method(method, BodyPublishers.noBody());
        }
        return http.send(builder.build(), BodyHandlers.ofString());
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> body(HttpResponse<String> response) {
        return json.readValue(response.body(), Map.class);
    }

    private String tokenOf(Actor actor) throws Exception {
        String email = users.findById(actor.id()).orElseThrow().getEmail();
        var response = call("POST", "/auth/login", null, null, Map.of("email", email, "password", "Senha1234"));
        assertThat(response.statusCode()).isEqualTo(200);
        return (String) body(response).get("token");
    }

    private static Map<String, Object> newRequest(String title) {
        return Map.of("title", title, "category", "SUPPLIES",
                "items", List.of(Map.of("description", "Cabo HDMI", "quantity", 2, "unitPrice", "25.00")));
    }

    private static void assertProblem(HttpResponse<String> response, int status) {
        assertThat(response.statusCode()).isEqualTo(status);
        assertThat(response.headers().firstValue("Content-Type")).hasValueSatisfying(ct -> assertThat(ct).contains("application/problem+json"));
    }

    // ---------- RF-01 / RF-02 ----------

    /** CA-01.6 and RN-01.5: /auth/me returns the caller and never a password or hash. */
    @Test
    void meReturnsTheCallerAndNoPasswordField() throws Exception {
        var response = call("GET", "/auth/me", tokenOf(n1), null, null);
        assertThat(response.statusCode()).isEqualTo(200);
        var me = body(response);
        assertThat(me.get("id")).isEqualTo(n1.id().toString());
        assertThat(me.get("role")).isEqualTo("APROVADOR");
        assertThat(me.get("approverLevel")).isEqualTo("NIVEL_1");
        assertThat(me.keySet()).noneMatch(key -> key.toLowerCase().contains("password") || key.toLowerCase().contains("hash"));
        assertThat(response.body()).doesNotContain("$2a$").doesNotContain("$2b$"); // no bcrypt hash anywhere
    }

    /** CA-02.3 and RN-01.6: a promotion applies to the next request, without waiting for a new token. */
    @Test
    void aRoleChangeAppliesToAnAlreadyIssuedToken() throws Exception {
        String token = tokenOf(owner);
        assertThat(call("GET", "/approvals/inbox", token, null, null).statusCode()).isEqualTo(403); // SOLICITANTE: no inbox

        int lock = users.findById(owner.id()).orElseThrow().getLockVersion();
        userAdmin.update(admin1, owner.id(), new UpdateUserInput(null, Role.APROVADOR, ApproverLevel.NIVEL_1, null, null, lock));

        assertThat(body(call("GET", "/auth/me", token, null, null)).get("role")).isEqualTo("APROVADOR");
        assertThat(call("GET", "/approvals/inbox", token, null, null).statusCode()).isEqualTo(200);
    }

    /** RN-01.7, CA-02.1 and RN-04.3: no token → 401, wrong role → 403, invisible or missing → 404, all problem+json. */
    @Test
    void authenticationRoleAndVisibilityFailuresUseTheirStatusAndCode() throws Exception {
        var anonymous = call("GET", "/requests", null, null, null);
        assertProblem(anonymous, 401);
        assertThat(body(anonymous).get("code")).isEqualTo("UNAUTHENTICATED");

        var notAdmin = call("GET", "/users", tokenOf(owner), null, null);
        assertProblem(notAdmin, 403);
        assertThat(body(notAdmin).get("code")).isEqualTo("FORBIDDEN");
        assertThat(call("GET", "/users", tokenOf(admin1), null, null).statusCode()).isEqualTo(200);

        var missing = call("GET", "/requests/" + UUID.randomUUID(), tokenOf(owner), null, null);
        assertProblem(missing, 404);
        assertThat(body(missing).get("code")).isEqualTo("NOT_FOUND");
    }

    // ---------- RNF-01 / RNF-04 ----------

    /** CA-R04.1, CA-R04.3, CA-R04.4 and RN-R04.2: the id is echoed when safe, generated otherwise. */
    @Test
    void everyResponseCarriesARequestId() throws Exception {
        var echoed = call("GET", "/health", null, "abc-123", null);
        assertThat(echoed.statusCode()).isEqualTo(200);
        assertThat(echoed.body()).contains("\"UP\"");
        assertThat(echoed.headers().firstValue("X-Request-Id")).hasValue("abc-123");

        assertThat(call("GET", "/health", null, null, null).headers().firstValue("X-Request-Id"))
                .hasValueSatisfying(id -> assertThat(id).matches(UUID_PATTERN));
        for (String unsafe : List.of("bad id!", "x".repeat(65), "<script>")) {
            assertThat(call("GET", "/health", null, unsafe, null).headers().firstValue("X-Request-Id"))
                    .hasValueSatisfying(id -> assertThat(id).matches(UUID_PATTERN));
        }
    }

    /** CA-R01.3, CA-R04.2 and RF-04 CA-04.3: errors are problem+json with type, title, status, code and requestId. */
    @Test
    void errorsAreProblemJsonWithCodeAndTheRequestId() throws Exception {
        var response = call("GET", "/requests?sort=password,asc", tokenOf(admin1), "sort-check-1", null);
        assertProblem(response, 400);
        var problem = body(response);
        assertThat(problem.get("code")).isEqualTo("INVALID_SORT");
        assertThat(problem.get("status")).isEqualTo(400);
        assertThat(problem.get("requestId")).isEqualTo("sort-check-1");
        assertThat(problem).containsKeys("type", "title", "detail");
        assertThat(response.body()).doesNotContain("Exception").doesNotContain("at com.example"); // no stack trace
    }

    /** RN-R01.5 and RF-03 CA-03.2: bean-validation failures list one entry per field in errors[]. */
    @Test
    @SuppressWarnings("unchecked")
    void validationErrorsListEachInvalidField() throws Exception {
        var invalid = Map.of("title", "", "category", "OTHER", "items", List.of(Map.of("description", "x", "quantity", 0, "unitPrice", "-1")));
        var response = call("POST", "/requests", tokenOf(owner), null, invalid);
        assertProblem(response, 400);
        var problem = body(response);
        assertThat(problem.get("code")).isEqualTo("VALIDATION_FAILED");
        var fields = ((List<Map<String, Object>>) problem.get("errors")).stream().map(e -> (String) e.get("field")).toList();
        assertThat(fields).contains("title", "items[0].quantity", "items[0].unitPrice");
    }

    // ---------- RF-11 ----------

    /** CA-11.3 and RN-R04.4: the X-Request-Id of each call is stored on the event it produced. */
    @Test
    @SuppressWarnings("unchecked")
    void theRequestIdOfEachCallIsStoredOnItsHistoryEvent() throws Exception {
        String token = tokenOf(owner);
        var created = call("POST", "/requests", token, "trace-create-1", newRequest("Cabos HDMI"));
        assertThat(created.statusCode()).isEqualTo(201);
        var request = body(created);
        String id = (String) request.get("id");

        var submitted = call("POST", "/requests/" + id + "/submit", token, "trace-submit-1", Map.of("lockVersion", request.get("lockVersion")));
        assertThat(submitted.statusCode()).isEqualTo(200);

        var history = json.readValue(call("GET", "/requests/" + id + "/history", token, null, null).body(), List.class);
        var byAction = ((List<Map<String, Object>>) history).stream()
                .collect(Collectors.toMap(e -> (String) e.get("action"), e -> e.get("xRequestId")));
        assertThat(byAction).containsEntry("REQUEST_CREATED", "trace-create-1").containsEntry("SUBMITTED", "trace-submit-1");
    }
}
