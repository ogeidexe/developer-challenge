package com.example.purchase.domain;

import java.util.List;
import java.util.Objects;
import java.util.UUID;

/**
 * Every business failure, as a sealed hierarchy. The domain says WHAT went wrong; the web layer maps each
 * subtype to an HTTP status with an exhaustive pattern-matching switch, so adding a subtype without a
 * mapping is a compile error. Messages explain the reason (README §4.3: "Ação inválida" is not enough).
 */
public abstract sealed class DomainException extends RuntimeException {

    private final ErrorCode code;

    private DomainException(ErrorCode code, String detail) {
        super(detail);
        this.code = Objects.requireNonNull(code);
    }

    public ErrorCode code() { return code; }

    public String detail() { return getMessage(); }

    /** 400 — input that fails a rule the schema annotations cannot express (future date, existing reference…). */
    public static final class Invalid extends DomainException {
        private final List<FieldError> errors;

        public Invalid(ErrorCode code, String detail, List<FieldError> errors) {
            super(code, detail);
            this.errors = List.copyOf(errors);
        }

        public static Invalid field(String field, String message) {
            return new Invalid(ErrorCode.VALIDATION_FAILED, "Um ou mais campos são inválidos.", List.of(new FieldError(field, message, "INVALID")));
        }

        public List<FieldError> errors() { return errors; }
    }

    /** 404 — absent OR outside the caller's visibility (ADR-012: existence is never disclosed). */
    public static final class NotFound extends DomainException {
        public NotFound(String detail) { super(ErrorCode.NOT_FOUND, detail); }
    }

    /** 403 — the role cannot perform this action type (FORBIDDEN), or the resource is someone else's (NOT_REQUEST_OWNER). */
    public static final class Forbidden extends DomainException {
        public Forbidden(ErrorCode code, String detail) { super(code, detail); }
    }

    /** 409 — stale lockVersion, idempotency key reused with another payload, duplicate unique value. */
    public static final class Conflict extends DomainException {
        private final Integer currentLockVersion;

        public Conflict(ErrorCode code, String detail, Integer currentLockVersion) {
            super(code, detail);
            this.currentLockVersion = currentLockVersion;
        }

        public static Conflict staleLock(int current) {
            return new Conflict(ErrorCode.CONCURRENCY_CONFLICT,
                    "A solicitação foi alterada por outro usuário. Atualize e tente novamente (lockVersion atual: %d).".formatted(current), current);
        }

        public Integer currentLockVersion() { return currentLockVersion; }
    }

    /** 422 — a business rule rejected the action (state, eligibility, segregation, comment, budget floor). */
    public static final class RuleViolation extends DomainException {
        public RuleViolation(ErrorCode code, String detail) { super(code, detail); }
    }

    /**
     * 422 BUDGET_EXCEEDED on a final approval. Carries what the audit trail needs, because the failed
     * attempt is recorded in its own transaction AFTER the transition transaction rolled back
     * (docs/database/TRANSACTION-STRATEGY.md §4).
     */
    public static final class BudgetExceeded extends DomainException {
        private final FailedApproval attempt;

        public BudgetExceeded(String detail, FailedApproval attempt) {
            super(ErrorCode.BUDGET_EXCEEDED, detail);
            this.attempt = attempt;
        }

        public FailedApproval attempt() { return attempt; }
    }

    public record FieldError(String field, String message, String code) {}

    public record FailedApproval(UUID requestId, StepLevel stepLevel, int stepSequence, int versionNumber, String comment) {}
}
