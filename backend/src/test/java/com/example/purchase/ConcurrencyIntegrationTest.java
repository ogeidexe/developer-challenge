package com.example.purchase;

import com.example.purchase.api.dto.RequestDtos.RequestDetail;
import com.example.purchase.application.RequestQueryService;
import com.example.purchase.domain.*;
import org.junit.jupiter.api.RepeatedTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * README §5.2 automated concurrency tests. Real threads, real transactions, real row locks: every task waits
 * on a start gate so they hit the database together. Assertions accept any winner, never any overdraw.
 */
@Testcontainers(disabledWithoutDocker = true) // also on the base; repeated in case the annotation is not inherited
class ConcurrencyIntegrationTest extends IntegrationTest {

    @Autowired RequestQueryService queries;

    /** Outcome of one concurrent attempt — a sealed type so the assertions can pattern-match exhaustively. */
    sealed interface Attempt<T> permits Success, Failure {}

    record Success<T>(T value) implements Attempt<T> {}

    record Failure<T>(Throwable error) implements Attempt<T> {}

    /** Runs all tasks at the same instant on separate threads and collects every outcome. */
    static <T> List<Attempt<T>> race(List<Callable<T>> tasks) throws Exception {
        try (ExecutorService pool = Executors.newFixedThreadPool(tasks.size())) {
            var ready = new CountDownLatch(tasks.size());
            var go = new CountDownLatch(1);
            List<Future<Attempt<T>>> futures = tasks.stream().map(task -> pool.submit(() -> {
                ready.countDown();
                go.await();
                try {
                    return (Attempt<T>) new Success<>(task.call());
                } catch (Exception e) {
                    return new Failure<T>(e);
                }
            })).toList();
            assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
            go.countDown();
            List<Attempt<T>> results = new java.util.ArrayList<>();
            for (var f : futures) results.add(f.get(30, TimeUnit.SECONDS));
            return results;
        }
    }

    static long count(List<? extends Attempt<?>> attempts, Class<?> errorType) {
        return attempts.stream().filter(a -> switch (a) {
            case Success<?> _ -> errorType == null;
            case Failure<?> f -> errorType != null && errorType.isInstance(f.error());
        }).count();
    }

    @RepeatedTest(5)
    void twoApprovalsOfTheSameStepExactlyOneWinsTheOtherGets409() throws Exception {
        budget(cc, "50000.00");
        var r = createAndSubmit(owner, "Mesma etapa", Category.EQUIPMENT, "5000.00"); // [N1, N2]; both n1 and n2 may decide N1
        int lock = r.lockVersion();

        List<Attempt<RequestDetail>> results = race(List.of(
                () -> transitions.approve(n1, r.id(), lock, null),
                () -> transitions.approve(n2, r.id(), lock, null)));

        assertThat(count(results, null)).isEqualTo(1);
        assertThat(count(results, DomainException.Conflict.class)).isEqualTo(1);
        var after = queries.detail(owner, r.id());
        assertThat(after.steps().getFirst().status()).isEqualTo(StepStatus.APPROVED);
        assertThat(after.lockVersion()).isEqualTo(lock + 1); // advanced exactly once
    }

    /** The race that a budget-first implementation gets wrong (it would answer 422 + a false audit row). */
    @RepeatedTest(5)
    void sameFinalStepWithAlmostNoBudgetStillGives409NotBudgetExceeded() throws Exception {
        budget(cc, "800.00");
        var r = createAndSubmit(owner, "Licença", Category.SOFTWARE, "700.00"); // [N1, ADMIN]
        r = transitions.approve(n1, r.id(), r.lockVersion(), null);
        int lock = r.lockVersion();
        var id = r.id();

        List<Attempt<RequestDetail>> results = race(List.of(
                () -> transitions.approve(admin1, id, lock, null),
                () -> transitions.approve(admin2, id, lock, null)));

        assertThat(count(results, null)).isEqualTo(1);
        assertThat(count(results, DomainException.Conflict.class)).isEqualTo(1);
        assertThat(count(results, DomainException.BudgetExceeded.class)).isZero();
        assertThat(consumed(cc)).isEqualTo(Money.parse("700.00"));
        assertThat(queries.history(owner, id)).extracting(e -> e.action()).doesNotContain("APPROVAL_FAILED_BUDGET");
    }

    @Test
    void finalApprovalsOfDifferentRequestsNeverOverdrawTheBudget() throws Exception {
        budget(cc, "10000.00");
        // five R$ 3.000 requests at their final step (N2) — only three fit in R$ 10.000
        List<RequestDetail> atFinalStep = IntStream.range(0, 5).mapToObj(i -> {
            var r = createAndSubmit(owner, "Pedido " + i, Category.EQUIPMENT, "3000.00");
            return transitions.approve(n1, r.id(), r.lockVersion(), null);
        }).toList();

        // the same N2 approver for every request is fine: segregation is per request version
        List<Attempt<RequestDetail>> results = race(atFinalStep.stream()
                .<Callable<RequestDetail>>map(r -> () -> transitions.approve(n2, r.id(), r.lockVersion(), null))
                .toList());

        assertThat(count(results, null)).isEqualTo(3);
        assertThat(count(results, DomainException.BudgetExceeded.class)).isEqualTo(2);
        Money consumed = consumed(cc);
        assertThat(consumed).isEqualTo(Money.parse("9000.00"));
        assertThat(consumed.cents()).isLessThanOrEqualTo(Money.parse("10000.00").cents());
    }
}
