package com.example.purchase.security;

import com.example.purchase.config.RequestContext;
import com.example.purchase.domain.ErrorCode;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.util.LinkedHashMap;

/** 401/403 raised by the security filters (before any controller) in the same problem+json shape as the rest. */
@Component
public class ProblemResponses {

    private final JsonMapper json;

    public ProblemResponses(JsonMapper json) {
        this.json = json;
    }

    public void unauthorized(HttpServletRequest request, HttpServletResponse response, AuthenticationException ex) throws IOException {
        write(response, 401, ErrorCode.UNAUTHENTICATED, "Token ausente, inválido ou expirado.");
    }

    public void forbidden(HttpServletRequest request, HttpServletResponse response, AccessDeniedException ex) throws IOException {
        write(response, 403, ErrorCode.FORBIDDEN, "Acesso negado.");
    }

    /** 413 from {@code RequestSizeLimitFilter}, before the body is read (SEC-F03). */
    public void payloadTooLarge(HttpServletResponse response, long maxBytes) throws IOException {
        write(response, 413, ErrorCode.PAYLOAD_TOO_LARGE, "O corpo da requisição excede o limite de %d bytes.".formatted(maxBytes));
    }

    private void write(HttpServletResponse response, int status, ErrorCode code, String detail) throws IOException {
        var body = new LinkedHashMap<String, Object>();
        body.put("type", "https://purchase-requests.example/problems/" + code.slug());
        body.put("title", code.title());
        body.put("status", status);
        body.put("detail", detail);
        body.put("code", code.name());
        body.put("requestId", RequestContext.requestId());
        response.setStatus(status);
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        response.getWriter().write(json.writeValueAsString(body));
    }
}
