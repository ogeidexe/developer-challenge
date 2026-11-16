package com.example.purchase.api;

import com.example.purchase.config.RequestContext;
import com.example.purchase.domain.DomainException;
import com.example.purchase.domain.ErrorCode;
import com.example.purchase.security.LoginAttemptLimiter.LoginThrottledException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.web.ErrorResponse;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.net.URI;
import java.util.List;

/**
 * Every error leaves as application/problem+json (RFC 9457) with type, title, status, detail, a machine
 * readable {@code code}, the {@code requestId}, plus {@code errors[]} (400) or {@code currentLockVersion} (409).
 * Stack traces and internals never reach the client.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    /** Exhaustive over the sealed hierarchy: a new DomainException subtype without a status is a compile error. */
    @ExceptionHandler(DomainException.class)
    ResponseEntity<ProblemDetail> domain(DomainException ex) {
        int status = switch (ex) {
            case DomainException.Invalid _ -> 400;
            case DomainException.Forbidden _ -> 403;
            case DomainException.NotFound _ -> 404;
            case DomainException.Conflict _ -> 409;
            case DomainException.RuleViolation _, DomainException.BudgetExceeded _ -> 422;
        };
        ProblemDetail problem = problem(status, ex.code(), ex.detail());
        if (ex instanceof DomainException.Invalid invalid && !invalid.errors().isEmpty()) {
            problem.setProperty("errors", invalid.errors());
        }
        if (ex instanceof DomainException.Conflict conflict && conflict.currentLockVersion() != null) {
            problem.setProperty("currentLockVersion", conflict.currentLockVersion());
        }
        return respond(problem);
    }

    /** Bean-validation failures on @RequestBody → 400 with one entry per field ("items[0].quantity"). */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ProblemDetail> invalidBody(MethodArgumentNotValidException ex) {
        List<DomainException.FieldError> errors = ex.getBindingResult().getFieldErrors().stream()
                .map(fe -> new DomainException.FieldError(fe.getField(), fe.getDefaultMessage(), fe.getCode()))
                .toList();
        return domain(new DomainException.Invalid(ErrorCode.VALIDATION_FAILED, "Um ou mais campos são inválidos.", errors));
    }

    @ExceptionHandler(HandlerMethodValidationException.class)
    ResponseEntity<ProblemDetail> invalidParameters(HandlerMethodValidationException ex) {
        return respond(problem(400, ErrorCode.VALIDATION_FAILED, "Parâmetros inválidos."));
    }

    @ExceptionHandler({HttpMessageNotReadableException.class, MissingServletRequestParameterException.class})
    ResponseEntity<ProblemDetail> unreadable(Exception ex) {
        if (causedByOversizedBody(ex)) { // a chunked body crossed the limit while Jackson was reading it (SEC-F03)
            return respond(problem(413, ErrorCode.PAYLOAD_TOO_LARGE, "O corpo da requisição excede o limite permitido."));
        }
        return respond(problem(400, ErrorCode.VALIDATION_FAILED, "Corpo ou parâmetros da requisição em formato inválido."));
    }

    /** Failed-login throttling (SEC-F01): 429 with Retry-After, same body shape as every other error. */
    @ExceptionHandler(LoginThrottledException.class)
    ResponseEntity<ProblemDetail> throttled(LoginThrottledException ex) {
        ProblemDetail problem = problem(429, ErrorCode.TOO_MANY_REQUESTS, ex.getMessage());
        return ResponseEntity.status(429).header(HttpHeaders.RETRY_AFTER, String.valueOf(ex.retryAfterSeconds())).body(problem);
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    ResponseEntity<ProblemDetail> typeMismatch(MethodArgumentTypeMismatchException ex) {
        return domain(DomainException.Invalid.field(ex.getName(), "Valor inválido: '%s'.".formatted(ex.getValue())));
    }

    @ExceptionHandler(AuthenticationException.class)
    ResponseEntity<ProblemDetail> unauthenticated(AuthenticationException ex) {
        return respond(problem(401, ErrorCode.UNAUTHENTICATED, ex.getMessage()));
    }

    @ExceptionHandler(AccessDeniedException.class)
    ResponseEntity<ProblemDetail> denied(AccessDeniedException ex) {
        return respond(problem(403, ErrorCode.FORBIDDEN, "Acesso negado."));
    }

    @ExceptionHandler(NoResourceFoundException.class)
    ResponseEntity<ProblemDetail> noRoute(NoResourceFoundException ex) {
        return respond(problem(404, ErrorCode.NOT_FOUND, "Rota não encontrada."));
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    ResponseEntity<ProblemDetail> method(HttpRequestMethodNotSupportedException ex) {
        return respond(problem(405, ErrorCode.VALIDATION_FAILED, "Método %s não suportado nesta rota.".formatted(ex.getMethod())));
    }

    /** A constraint the application should have prevented (e.g. a unique race) — a conflict, not a crash. */
    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<ProblemDetail> integrity(DataIntegrityViolationException ex) {
        log.warn("Constraint violation", ex);
        return respond(problem(409, ErrorCode.CONCURRENCY_CONFLICT, "A operação conflitou com uma alteração concorrente. Atualize e tente novamente."));
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ProblemDetail> unexpected(Exception ex) {
        // framework client errors without a dedicated handler (415, 406, 413, …) keep their 4xx status instead
        // of becoming a 500 with an error-level stack trace that any caller could trigger at will (SEC-F10)
        if (ex instanceof ErrorResponse framework && framework.getStatusCode().is4xxClientError()) {
            int status = framework.getStatusCode().value();
            ErrorCode code = switch (status) {
                case 404 -> ErrorCode.NOT_FOUND;
                case 413 -> ErrorCode.PAYLOAD_TOO_LARGE;
                default -> ErrorCode.VALIDATION_FAILED;
            };
            return respond(problem(status, code, "Requisição não suportada por esta rota."));
        }
        log.error("Unexpected error", ex);
        return respond(problem(500, ErrorCode.INTERNAL, "Erro inesperado. Informe o código de correlação: " + RequestContext.requestId()));
    }

    // ---------- helpers ----------

    private static boolean causedByOversizedBody(Throwable ex) {
        for (Throwable t = ex; t != null; t = t.getCause()) {
            if (t instanceof RequestSizeLimitFilter.PayloadTooLargeException) return true;
            if (t.getCause() == t) break;
        }
        return false;
    }

    static ProblemDetail problem(int status, ErrorCode code, String detail) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatusCode.valueOf(status), detail);
        problem.setType(URI.create("https://purchase-requests.example/problems/" + code.slug()));
        problem.setTitle(code.title());
        problem.setProperty("code", code.name());
        problem.setProperty("requestId", RequestContext.requestId());
        return problem;
    }

    private static ResponseEntity<ProblemDetail> respond(ProblemDetail problem) {
        return ResponseEntity.status(problem.getStatus()).body(problem);
    }
}
