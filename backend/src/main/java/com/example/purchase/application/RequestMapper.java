package com.example.purchase.application;

import com.example.purchase.api.dto.CommonDtos.CostCenterRef;
import com.example.purchase.api.dto.CommonDtos.Ref;
import com.example.purchase.api.dto.RequestDtos.*;
import com.example.purchase.domain.AccessPolicy;
import com.example.purchase.domain.Actor;
import com.example.purchase.domain.StepState;
import com.example.purchase.persistence.*;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/** Entity → DTO. Names and codes are resolved in batches (one query per kind), not per row. */
@Component
public class RequestMapper {

    private final UserRepository users;
    private final CostCenterRepository centers;
    private final RequestItemRepository items;
    private final RequestVersionRepository versions;
    private final VersionItemRepository versionItems;
    private final ApprovalStepRepository steps;

    public RequestMapper(UserRepository users, CostCenterRepository centers, RequestItemRepository items,
                         RequestVersionRepository versions, VersionItemRepository versionItems, ApprovalStepRepository steps) {
        this.users = users;
        this.centers = centers;
        this.items = items;
        this.versions = versions;
        this.versionItems = versionItems;
        this.steps = steps;
    }

    // ---------- lookups ----------

    /** id → display name for every user referenced by the given ids (nulls ignored). */
    public Map<UUID, String> userNames(Collection<UUID> ids) {
        Set<UUID> wanted = ids.stream().filter(Objects::nonNull).collect(Collectors.toSet());
        if (wanted.isEmpty()) return Map.of();
        return users.findAllById(wanted).stream().collect(Collectors.toMap(UserEntity::getId, UserEntity::getName));
    }

    /** The cost-center table is tiny: load it whole. */
    public Map<UUID, String> centerCodes() {
        return centers.findAll().stream().collect(Collectors.toMap(CostCenterEntity::getId, CostCenterEntity::getCode));
    }

    private static Ref ref(UUID id, Map<UUID, String> names) {
        return id == null ? null : new Ref(id, names.getOrDefault(id, "?"));
    }

    // ---------- summaries ----------

    public List<RequestSummary> summaries(List<PurchaseRequestEntity> list) {
        Map<UUID, String> names = userNames(list.stream().map(PurchaseRequestEntity::getOwnerId).toList());
        Map<UUID, String> codes = centerCodes();
        return list.stream().map(r -> summary(r, names, codes)).toList();
    }

    public RequestSummary summary(PurchaseRequestEntity r, Map<UUID, String> names, Map<UUID, String> codes) {
        return new RequestSummary(r.getId(), r.getRequestNumber(), r.getTitle(), r.getCategory(), r.getStatus(),
                r.getTotal().toDecimalString(), ref(r.getOwnerId(), names),
                new CostCenterRef(r.getCostCenterId(), codes.getOrDefault(r.getCostCenterId(), "?")),
                r.getCurrentVersion(), r.getNeededBy(), r.getCreatedAt(), r.getSubmittedAt());
    }

    // ---------- detail ----------

    public RequestDetail detail(Actor actor, PurchaseRequestEntity r) {
        List<RequestVersionEntity> allVersions = versions.findByRequestIdOrderByVersionNumberAsc(r.getId());
        Optional<RequestVersionEntity> current = allVersions.stream()
                .filter(v -> v.getVersionNumber() == r.getCurrentVersion()).findFirst();
        List<ApprovalStepEntity> chain = current.map(v -> steps.findByVersionIdOrderBySequenceAsc(v.getId())).orElse(List.of());

        // editable states show the working copy (what the next version will be); others the frozen version
        List<ItemDto> itemDtos = (r.getStatus().isEditable() || current.isEmpty())
                ? items.findByRequestIdOrderByPositionAsc(r.getId()).stream().map(RequestMapper::item).toList()
                : versionItems.findByVersionIdOrderByPositionAsc(current.get().getId()).stream().map(RequestMapper::item).toList();

        Map<UUID, String> names = userNames(Stream.concat(Stream.of(r.getOwnerId()), chain.stream().map(ApprovalStepEntity::getApproverId)).toList());
        Map<UUID, String> codes = centerCodes();

        var view = new AccessPolicy.RequestView(r.getOwnerId(), r.getStatus(),
                current.map(RequestVersionEntity::getCostCenterId).orElse(r.getCostCenterId()),
                chain.stream().map(ApprovalStepEntity::toState).toList());

        return new RequestDetail(r.getId(), r.getRequestNumber(), r.getTitle(), r.getDescription(), r.getCategory(),
                r.getStatus(), r.getTotal().toDecimalString(), ref(r.getOwnerId(), names),
                new CostCenterRef(r.getCostCenterId(), codes.getOrDefault(r.getCostCenterId(), "?")),
                r.getCurrentVersion(), r.getNeededBy(), current.map(RequestVersionEntity::getCompetenceMonth).orElse(null),
                r.getCreatedAt(), r.getSubmittedAt(), r.getDecidedAt(), itemDtos,
                chain.stream().map(s -> step(s, names)).toList(),
                allVersions.stream().map(v -> new VersionRef(v.getVersionNumber(), v.getSubmittedAt())).toList(),
                AccessPolicy.allowedActions(actor, view), r.getLockVersion());
    }

    public List<RequestVersionDto> versions(List<RequestVersionEntity> list) {
        if (list.isEmpty()) return List.of();
        Map<UUID, List<ApprovalStepEntity>> stepsByVersion = steps
                .findByVersionIdInOrderBySequenceAsc(list.stream().map(RequestVersionEntity::getId).toList())
                .stream().collect(Collectors.groupingBy(ApprovalStepEntity::getVersionId, LinkedHashMap::new, Collectors.toList()));
        Map<UUID, String> names = userNames(Stream.concat(
                list.stream().map(RequestVersionEntity::getSubmittedBy),
                stepsByVersion.values().stream().flatMap(List::stream).map(ApprovalStepEntity::getApproverId)).toList());
        Map<UUID, String> codes = centerCodes();
        return list.stream().map(v -> new RequestVersionDto(v.getVersionNumber(), v.getTitle(), v.getDescription(),
                v.getCategory(), new CostCenterRef(v.getCostCenterId(), codes.getOrDefault(v.getCostCenterId(), "?")),
                v.getNeededBy(), v.getTotal().toDecimalString(), v.getCompetenceMonth(), v.getSubmittedAt(),
                ref(v.getSubmittedBy(), names),
                versionItems.findByVersionIdOrderByPositionAsc(v.getId()).stream().map(RequestMapper::item).toList(),
                stepsByVersion.getOrDefault(v.getId(), List.of()).stream().map(s -> step(s, names)).toList())).toList();
    }

    public List<EventDto> events(List<RequestEventEntity> list) {
        Map<UUID, String> names = userNames(list.stream().map(RequestEventEntity::getActorId).toList());
        return list.stream().map(e -> new EventDto(e.getId(), ref(e.getActorId(), names), e.getActorRole(), e.getAction(),
                e.getFromStatus(), e.getToStatus(), e.getStepLevel(), e.getStepSequence(), e.getVersionNumber(),
                e.getComment(), e.getXRequestId(), e.getOccurredAt())).toList();
    }

    public StepDto step(ApprovalStepEntity s, Map<UUID, String> names) {
        return new StepDto(s.getSequence(), s.getLevel(), s.getStatus(), ref(s.getApproverId(), names), s.getDecidedAt(), s.getComment());
    }

    // ---------- items (two entity types, one DTO) ----------

    private static ItemDto item(RequestItemEntity i) {
        return new ItemDto(i.getPosition(), i.getDescription(), i.getQuantity(),
                i.getUnitPrice().toDecimalString(), i.getLineTotal().toDecimalString());
    }

    private static ItemDto item(VersionItemEntity i) {
        return new ItemDto(i.getPosition(), i.getDescription(), i.getQuantity(),
                i.getUnitPrice().toDecimalString(), i.getLineTotal().toDecimalString());
    }

    /** Used by the inbox: the chain of each request's current version as domain step states. */
    public List<StepState> chainOf(UUID versionId) {
        return steps.findByVersionIdOrderBySequenceAsc(versionId).stream().map(ApprovalStepEntity::toState).toList();
    }
}
