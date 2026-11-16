package com.example.purchase.application;

import com.example.purchase.api.dto.CommonDtos.PageResponse;
import com.example.purchase.api.dto.RequestDtos.*;
import com.example.purchase.application.RequestSpecifications.ListFilter;
import com.example.purchase.domain.Actor;
import com.example.purchase.domain.BusinessCalendar;
import com.example.purchase.domain.DomainException;
import com.example.purchase.persistence.*;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@Transactional(readOnly = true)
public class RequestQueryService {

    public static final int MAX_PAGE_SIZE = 100;

    private final PurchaseRequestRepository requests;
    private final RequestVersionRepository versions;
    private final RequestEventRepository events;
    private final RequestAccess access;
    private final RequestMapper mapper;
    private final BusinessCalendar calendar;

    public RequestQueryService(PurchaseRequestRepository requests, RequestVersionRepository versions,
                               RequestEventRepository events, RequestAccess access, RequestMapper mapper,
                               BusinessCalendar calendar) {
        this.requests = requests;
        this.versions = versions;
        this.events = events;
        this.access = access;
        this.mapper = mapper;
        this.calendar = calendar;
    }

    public RequestDetail detail(Actor actor, UUID id) {
        return mapper.detail(actor, access.loadVisible(actor, id));
    }

    /** Server-side pagination, sorting and filtering, always intersected with the caller's visibility. */
    public PageResponse<RequestSummary> list(Actor actor, ListFilter filter, int page, int size, String sort) {
        // A-30: out-of-range paging is clamped, never a 400 (shareable URLs stay valid)
        var pageable = PageRequest.of(Math.max(page, 0), Math.clamp(size, 1, MAX_PAGE_SIZE), RequestSpecifications.parseSort(sort));
        var spec = RequestSpecifications.visibleTo(actor).and(RequestSpecifications.matching(filter, calendar));
        Page<PurchaseRequestEntity> result = requests.findAll(spec, pageable);
        List<RequestSummary> data = mapper.summaries(result.getContent());
        return new PageResponse<>(data, result.getNumber(), result.getSize(), result.getTotalElements(), result.getTotalPages());
    }

    public List<RequestVersionDto> versions(Actor actor, UUID id) {
        var r = access.loadVisible(actor, id);
        return mapper.versions(versions.findByRequestIdOrderByVersionNumberAsc(r.getId()));
    }

    public RequestVersionDto version(Actor actor, UUID id, int number) {
        var r = access.loadVisible(actor, id);
        var v = versions.findByRequestIdAndVersionNumber(r.getId(), number)
                .orElseThrow(() -> new DomainException.NotFound("Versão %d não encontrada.".formatted(number)));
        return mapper.versions(List.of(v)).getFirst();
    }

    public List<EventDto> history(Actor actor, UUID id) {
        var r = access.loadVisible(actor, id);
        return mapper.events(events.findByRequestIdOrderByOccurredAtAscIdAsc(r.getId()));
    }
}
