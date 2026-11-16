package com.example.purchase.application;

import com.example.purchase.domain.*;
import com.example.purchase.persistence.PurchaseRequestEntity;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/**
 * Dynamic list queries with the Criteria API. The visibility predicate is the SAME rule as
 * {@link AccessPolicy#canSee}, expressed in SQL, and is shared by the list and the dashboard.
 */
public final class RequestSpecifications {

    private static final Map<String, String> SORTABLE = Map.of(
            "createdAt", "createdAt", "title", "title", "total", "totalCents", "status", "status", "submittedAt", "submittedAt");

    /** Escape character of every LIKE built from user input. */
    public static final char LIKE_ESCAPE = '\\';
    /** Longest accepted free-text search term (SEC-F09). */
    public static final int MAX_SEARCH_LENGTH = 100;

    private RequestSpecifications() {}

    /**
     * "%term%" for a case-insensitive contains-search, with the LIKE wildcards of the user's text escaped:
     * a search for "50%" or "a_b" matches those characters literally instead of acting as a pattern (SEC-F09).
     * The value is always bound as a parameter — this is about wildcard semantics, not SQL injection.
     */
    public static String containsPattern(String field, String raw) {
        String term = raw.strip().toLowerCase(Locale.ROOT);
        if (term.length() > MAX_SEARCH_LENGTH) {
            throw DomainException.Invalid.field(field, "No máximo %d caracteres.".formatted(MAX_SEARCH_LENGTH));
        }
        String escaped = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
        return "%" + escaped + "%";
    }

    public record ListFilter(RequestStatus status, Category category, List<UUID> costCenterIds, LocalDate createdFrom,
                             LocalDate createdTo, Money minAmount, Money maxAmount, String q) {

        public static ListFilter none() { return new ListFilter(null, null, List.of(), null, null, null, null, null); }
    }

    public static Specification<PurchaseRequestEntity> visibleTo(Actor actor) {
        return (root, query, cb) -> {
            Predicate owner = cb.equal(root.get("ownerId"), actor.id());
            Predicate notDraft = cb.notEqual(root.get("status"), RequestStatus.DRAFT); // drafts: owner only (A-26)
            return switch (actor.role()) {
                case ADMIN -> cb.or(owner, notDraft);
                case APROVADOR -> cb.or(owner, cb.and(notDraft, cb.equal(root.get("costCenterId"), actor.costCenterId())));
                case SOLICITANTE -> owner;
            };
        };
    }

    public static Specification<PurchaseRequestEntity> matching(ListFilter f, BusinessCalendar calendar) {
        return (root, query, cb) -> {
            List<Predicate> p = new ArrayList<>();
            if (f.status() != null) p.add(cb.equal(root.get("status"), f.status()));
            if (f.category() != null) p.add(cb.equal(root.get("category"), f.category()));
            if (!f.costCenterIds().isEmpty()) p.add(root.get("costCenterId").in(f.costCenterIds()));
            // createdFrom/createdTo are business dates (inclusive) → UTC instants of the São Paulo day boundaries
            if (f.createdFrom() != null) p.add(cb.greaterThanOrEqualTo(root.<Instant>get("createdAt"), calendar.startOfDay(f.createdFrom())));
            if (f.createdTo() != null) p.add(cb.lessThan(root.<Instant>get("createdAt"), calendar.startOfDay(f.createdTo().plusDays(1))));
            if (f.minAmount() != null) p.add(cb.greaterThanOrEqualTo(root.<Long>get("totalCents"), f.minAmount().cents()));
            if (f.maxAmount() != null) p.add(cb.lessThanOrEqualTo(root.<Long>get("totalCents"), f.maxAmount().cents()));
            if (f.q() != null && !f.q().isBlank()) {
                p.add(cb.like(cb.lower(root.<String>get("title")), containsPattern("q", f.q()), LIKE_ESCAPE));
            }
            return cb.and(p.toArray(Predicate[]::new));
        };
    }

    public static Specification<PurchaseRequestEntity> hasStatus(RequestStatus status) {
        return (root, query, cb) -> cb.equal(root.get("status"), status);
    }

    /** "total,desc" → Sort on the mapped property; unknown field/direction → 400 INVALID_SORT. */
    public static Sort parseSort(String raw) {
        String[] parts = (raw == null || raw.isBlank() ? "createdAt,desc" : raw).split(",");
        String property = SORTABLE.get(parts[0].strip());
        String direction = parts.length > 1 ? parts[1].strip().toLowerCase() : "asc";
        if (property == null || !(direction.equals("asc") || direction.equals("desc"))) {
            throw new DomainException.Invalid(ErrorCode.INVALID_SORT,
                    "Ordenação inválida '%s'. Campos permitidos: %s; direção asc|desc.".formatted(raw, String.join(", ", SORTABLE.keySet())),
                    List.of());
        }
        return Sort.by(Sort.Direction.fromString(direction), property).and(Sort.by("id"));
    }
}
