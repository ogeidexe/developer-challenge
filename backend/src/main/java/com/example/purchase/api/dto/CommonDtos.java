package com.example.purchase.api.dto;

import org.springframework.data.domain.Page;

import java.util.List;
import java.util.UUID;
import java.util.function.Function;

/** Shared wire types. */
public final class CommonDtos {

    private CommonDtos() {}

    public record Ref(UUID id, String name) {}

    public record CostCenterRef(UUID id, String code) {}

    /**
     * Pagination envelope of README §3.2: {@code { data, page, size, totalElements, totalPages }}.
     * Generic over the item type; built either from a Spring Data page or from an in-memory list.
     */
    public record PageResponse<T>(List<T> data, int page, int size, long totalElements, int totalPages) {

        public static <E, T> PageResponse<T> from(Page<E> page, Function<? super E, ? extends T> mapper) {
            List<T> data = page.getContent().stream().<T>map(mapper).toList();
            return new PageResponse<>(data, page.getNumber(), page.getSize(), page.getTotalElements(), page.getTotalPages());
        }

        public static <T> PageResponse<T> slice(List<T> all, int page, int size) {
            int from = Math.min(page * size, all.size());
            int to = Math.min(from + size, all.size());
            int totalPages = (int) Math.ceil(all.size() / (double) size);
            return new PageResponse<>(List.copyOf(all.subList(from, to)), page, size, all.size(), totalPages);
        }
    }
}
