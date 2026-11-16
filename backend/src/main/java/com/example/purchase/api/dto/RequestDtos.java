package com.example.purchase.api.dto;

import com.example.purchase.api.dto.CommonDtos.CostCenterRef;
import com.example.purchase.api.dto.CommonDtos.Ref;
import com.example.purchase.domain.*;
import com.fasterxml.jackson.annotation.JsonUnwrapped;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/** Purchase-request contract (docs/api/openapi.yaml). Money is always a decimal string ("4899.90"). */
public final class RequestDtos {

    private RequestDtos() {}

    // ---------- input ----------

    public record ItemInput(
            @NotBlank @Size(max = 255) String description,
            @NotNull @Min(1) @Max(1_000_000) Integer quantity,
            @NotBlank @Pattern(regexp = "^\\d{1,13}(\\.\\d{1,2})?$", message = "deve ser um valor como 4899.90") String unitPrice) {}

    /**
     * Create payload. There is NO total field: the server computes it (README §2.2) and ignores
     * any extra property the client sends.
     */
    public record RequestInput(
            @NotBlank @Size(min = 3, max = 120) String title,
            @Size(max = 2000) String description,
            @NotNull Category category,
            UUID costCenterId,
            LocalDate neededBy,
            @NotEmpty @Size(max = 50) List<@Valid ItemInput> items) {}

    /** Edit payload = create payload + the current lockVersion (optimistic concurrency, README §3.2). */
    public record RequestUpdateInput(
            @NotBlank @Size(min = 3, max = 120) String title,
            @Size(max = 2000) String description,
            @NotNull Category category,
            UUID costCenterId,
            LocalDate neededBy,
            @NotEmpty @Size(max = 50) List<@Valid ItemInput> items,
            @NotNull @Min(1) Integer lockVersion) {

        public RequestInput toInput() {
            return new RequestInput(title, description, category, costCenterId, neededBy, items);
        }
    }

    /**
     * Body of submit/approve/reject/request-changes/cancel. The ≥ 10-char comment rule is a BUSINESS rule
     * (422 COMMENT_REQUIRED, only for reject/return) — deliberately not a schema constraint here.
     */
    public record TransitionInput(@NotNull @Min(1) Integer lockVersion, @Size(max = 2000) String comment) {}

    // ---------- output ----------

    public record ItemDto(int position, String description, int quantity, String unitPrice, String lineTotal) {}

    public record StepDto(int sequence, StepLevel level, StepStatus status, Ref approver, Instant decidedAt, String comment) {}

    public record VersionRef(int versionNumber, Instant submittedAt) {}

    public record RequestSummary(
            UUID id, String requestNumber, String title, Category category, RequestStatus status, String total,
            Ref owner, CostCenterRef costCenter, int currentVersion, LocalDate neededBy,
            Instant createdAt, Instant submittedAt) {}

    public record RequestDetail(
            UUID id, String requestNumber, String title, String description, Category category, RequestStatus status,
            String total, Ref owner, CostCenterRef costCenter, int currentVersion, LocalDate neededBy,
            String competenceMonth, Instant createdAt, Instant submittedAt, Instant decidedAt,
            List<ItemDto> items, List<StepDto> steps, List<VersionRef> versions,
            Set<AllowedAction> allowedActions, int lockVersion) {}

    public record RequestVersionDto(
            int versionNumber, String title, String description, Category category, CostCenterRef costCenter,
            LocalDate neededBy, String total, String competenceMonth, Instant submittedAt, Ref submittedBy,
            List<ItemDto> items, List<StepDto> steps) {}

    public record EventDto(
            long id, Ref actor, Role actorRole, String action, RequestStatus fromStatus, RequestStatus toStatus,
            StepLevel stepLevel, Integer stepSequence, int versionNumber, String comment, String xRequestId,
            Instant occurredAt) {}

    /** Inbox row = summary fields (flattened) + the step the caller can decide now. */
    public record InboxItem(@JsonUnwrapped RequestSummary summary, StepDto currentStep) {}

    public record StatusCount(RequestStatus status, long count) {}

    public record BudgetLine(UUID costCenterId, String code, String name, String month,
                             String amount, String consumed, String available) {}

    public record DashboardSummary(List<StatusCount> totals, List<BudgetLine> budgets, Double averageApprovalTimeDays) {}
}
