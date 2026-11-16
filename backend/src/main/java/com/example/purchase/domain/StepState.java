package com.example.purchase.domain;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Read-only view of one approval step, so the policies stay free of persistence types. */
public record StepState(int sequence, StepLevel level, StepStatus status, UUID approverId) {

    /** The current step = the first PENDING one (steps are ordered by sequence). */
    public static Optional<StepState> current(List<StepState> chain) {
        return chain.stream().filter(s -> s.status() == StepStatus.PENDING).findFirst();
    }

    /** True when {@code step} is the only PENDING step left, i.e. approving it ends the chain. */
    public static boolean isLast(List<StepState> chain, StepState step) {
        return chain.stream().noneMatch(s -> s.status() == StepStatus.PENDING && s.sequence() > step.sequence());
    }
}
