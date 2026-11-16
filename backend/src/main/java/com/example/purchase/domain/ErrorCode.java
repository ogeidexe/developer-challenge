package com.example.purchase.domain;

/** Machine-readable error codes of docs/api/ERROR-CATALOG.md (the `code` field of problem+json). */
public enum ErrorCode {
    VALIDATION_FAILED("Entrada inválida"),
    INVALID_SORT("Ordenação inválida"),
    INVALID_MONTH_FORMAT("Mês inválido"),
    UNAUTHENTICATED("Não autenticado"),
    FORBIDDEN("Acesso negado"),
    NOT_REQUEST_OWNER("Ação restrita ao proprietário"),
    NOT_FOUND("Recurso não encontrado"),
    CONCURRENCY_CONFLICT("Conflito de concorrência"),
    IDEMPOTENCY_PAYLOAD_MISMATCH("Idempotency-Key reutilizada"),
    EMAIL_ALREADY_REGISTERED("E-mail já cadastrado"),
    CODE_ALREADY_USED("Código já utilizado"),
    INVALID_TRANSITION("Transição inválida"),
    APPROVER_NOT_ELIGIBLE("Aprovador não elegível"),
    SELF_APPROVAL_FORBIDDEN("Segregação de funções"),
    DUPLICATE_APPROVER("Segregação de funções"),
    COMMENT_REQUIRED("Comentário obrigatório"),
    BUDGET_EXCEEDED("Orçamento insuficiente"),
    BUDGET_BELOW_CONSUMED("Orçamento abaixo do consumido"),
    TOO_MANY_REQUESTS("Muitas tentativas"),
    PAYLOAD_TOO_LARGE("Requisição muito grande"),
    INTERNAL("Erro inesperado");

    private final String title;

    ErrorCode(String title) { this.title = title; }

    public String title() { return title; }

    /** URL slug for the problem `type`, e.g. BUDGET_EXCEEDED → "budget-exceeded". */
    public String slug() { return name().toLowerCase().replace('_', '-'); }
}
