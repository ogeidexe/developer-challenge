package com.example.purchase.application;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Background cleanup of expired idempotency keys (runs on a virtual thread — spring.threads.virtual.enabled). */
@Component
public class IdempotencyPurgeJob {

    private static final Logger log = LoggerFactory.getLogger(IdempotencyPurgeJob.class);

    private final IdempotencyService idempotency;

    public IdempotencyPurgeJob(IdempotencyService idempotency) {
        this.idempotency = idempotency;
    }

    @Scheduled(fixedDelayString = "${app.idempotency.purge-interval}", initialDelayString = "PT1M")
    public void purge() {
        int removed = idempotency.purgeExpired();
        if (removed > 0) log.info("Purged {} expired idempotency keys", removed);
    }
}
