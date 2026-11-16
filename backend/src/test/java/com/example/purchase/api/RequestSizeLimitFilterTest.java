package com.example.purchase.api;

import com.example.purchase.config.AppProperties;
import com.example.purchase.security.ProblemResponses;
import jakarta.servlet.ServletRequest;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.util.unit.DataSize;
import tools.jackson.databind.json.JsonMapper;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** SEC-F03 — request bodies are capped before they are parsed. */
class RequestSizeLimitFilterTest {

    private static final int LIMIT = 64;

    private final RequestSizeLimitFilter filter = new RequestSizeLimitFilter(props(), new ProblemResponses(JsonMapper.builder().build()));

    private static AppProperties props() {
        return new AppProperties(
                new AppProperties.Jwt("unit-test-secret-that-is-at-least-32-bytes", "iss", "aud", Duration.ofMinutes(15)),
                new AppProperties.Idempotency(Duration.ofHours(24), Duration.ofHours(1)),
                new AppProperties.Seed(false),
                new AppProperties.Security(new AppProperties.Login(5, 50, Duration.ofMinutes(15)), DataSize.ofBytes(LIMIT)));
    }

    private static MockHttpServletRequest post(byte[] body) {
        var request = new MockHttpServletRequest("POST", "/auth/login");
        request.setContentType("application/json");
        request.setContent(body);
        return request;
    }

    /** A request without Content-Length (chunked transfer encoding). */
    private static MockHttpServletRequest chunked(byte[] body) {
        var request = new MockHttpServletRequest("POST", "/requests") {
            @Override public long getContentLengthLong() { return -1; }
            @Override public int getContentLength() { return -1; }
        };
        request.setContentType("application/json");
        request.setContent(body);
        return request;
    }

    @Test
    void refusesADeclaredBodyAboveTheLimitWithoutCallingTheChain() throws Exception {
        var response = new MockHttpServletResponse();
        var reached = new AtomicReference<ServletRequest>();
        filter.doFilter(post(new byte[LIMIT + 1]), response, (req, res) -> reached.set(req));

        assertThat(reached.get()).isNull();
        assertThat(response.getStatus()).isEqualTo(413);
        assertThat(response.getContentType()).startsWith("application/problem+json");
        assertThat(response.getContentAsString(StandardCharsets.UTF_8)).contains("\"code\":\"PAYLOAD_TOO_LARGE\"");
    }

    @Test
    void passesABodyWithinTheLimitUntouched() throws Exception {
        var response = new MockHttpServletResponse();
        var reached = new AtomicReference<ServletRequest>();
        var request = post("{\"email\":\"a@b.c\"}".getBytes(StandardCharsets.UTF_8));
        filter.doFilter(request, response, (req, res) -> reached.set(req));

        assertThat(reached.get()).isSameAs(request);
        assertThat(response.getStatus()).isEqualTo(200);
    }

    @Test
    void stopsReadingAChunkedBodyThatCrossesTheLimit() throws Exception {
        var reached = new AtomicReference<ServletRequest>();
        filter.doFilter(chunked(new byte[LIMIT * 4]), new MockHttpServletResponse(), (req, res) -> reached.set(req));

        var stream = reached.get().getInputStream();
        assertThatThrownBy(() -> stream.readAllBytes()).isInstanceOf(RequestSizeLimitFilter.PayloadTooLargeException.class);
    }

    @Test
    void readsASmallChunkedBodyNormally() throws Exception {
        var reached = new AtomicReference<ServletRequest>();
        byte[] body = "{\"lockVersion\":1}".getBytes(StandardCharsets.UTF_8);
        filter.doFilter(chunked(body), new MockHttpServletResponse(), (req, res) -> reached.set(req));

        assertThat(reached.get().getInputStream().readAllBytes()).isEqualTo(body);
    }
}
