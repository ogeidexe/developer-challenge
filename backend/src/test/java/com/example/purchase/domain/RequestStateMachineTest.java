package com.example.purchase.domain;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

import java.util.Map;
import java.util.stream.Stream;

import static com.example.purchase.domain.Action.*;
import static com.example.purchase.domain.RequestStatus.*;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Every (status × action) pair of README §4.2 — valid ones land on the right status, the rest are 422. */
class RequestStateMachineTest {

    /** The README table: (from, action, lastStep) → to. Anything not listed is invalid. */
    private static final Map<String, RequestStatus> VALID = Map.of(
            key(DRAFT, SUBMIT), PENDING_APPROVAL,
            key(DRAFT, CANCEL), CANCELLED,
            key(PENDING_APPROVAL, REJECT), REJECTED,
            key(PENDING_APPROVAL, REQUEST_CHANGES), CHANGES_REQUESTED,
            key(PENDING_APPROVAL, CANCEL), CANCELLED,
            key(CHANGES_REQUESTED, SUBMIT), PENDING_APPROVAL,
            key(CHANGES_REQUESTED, CANCEL), CANCELLED);

    private static String key(RequestStatus from, Action action) { return from + ":" + action; }

    static Stream<Arguments> everyPair() {
        return Stream.of(RequestStatus.values()).flatMap(s -> Stream.of(Action.values()).map(a -> Arguments.of(s, a)));
    }

    @ParameterizedTest(name = "{0} --{1}-->")
    @MethodSource("everyPair")
    void followsTheTransitionTable(RequestStatus from, Action action) {
        if (from == PENDING_APPROVAL && action == APPROVE) {
            assertThat(RequestStateMachine.next(from, action, false)).isEqualTo(PENDING_APPROVAL); // intermediate step
            assertThat(RequestStateMachine.next(from, action, true)).isEqualTo(APPROVED);          // last step
        } else if (VALID.containsKey(key(from, action))) {
            assertThat(RequestStateMachine.next(from, action, false)).isEqualTo(VALID.get(key(from, action)));
        } else {
            assertThatThrownBy(() -> RequestStateMachine.next(from, action, false))
                    .isInstanceOfSatisfying(DomainException.RuleViolation.class, e -> {
                        assertThat(e.code()).isEqualTo(ErrorCode.INVALID_TRANSITION);
                        assertThat(e.detail()).contains(action.verb()).contains(from.name()); // explains why (README §4.3)
                    });
        }
    }

    @ParameterizedTest
    @MethodSource("everyPair")
    void finalStatesBlockEverything(RequestStatus from, Action action) {
        if (from.isFinal()) assertThat(RequestStateMachine.canApply(from, action)).isFalse();
    }
}
