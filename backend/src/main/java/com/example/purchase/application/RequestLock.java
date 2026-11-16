package com.example.purchase.application;

import com.example.purchase.domain.BusinessCalendar;
import com.example.purchase.domain.DomainException;
import com.example.purchase.persistence.PurchaseRequestEntity;
import com.example.purchase.persistence.PurchaseRequestRepository;
import org.springframework.stereotype.Component;

/**
 * The 409 stage of README §4.3. Must run inside the transition transaction and BEFORE any other write
 * or business rule (ADR-009): the conditional UPDATE both checks the client's lockVersion and row-locks
 * the request until commit, so every later check runs on a row nobody else can change.
 */
@Component
public class RequestLock {

    private final PurchaseRequestRepository requests;
    private final BusinessCalendar calendar;

    public RequestLock(PurchaseRequestRepository requests, BusinessCalendar calendar) {
        this.requests = requests;
        this.calendar = calendar;
    }

    /** @return the request re-read after the claim (the persistence context was cleared by the UPDATE) */
    public PurchaseRequestEntity claim(PurchaseRequestEntity loaded, int expectedLockVersion) {
        if (loaded.getLockVersion() != expectedLockVersion) {
            throw DomainException.Conflict.staleLock(loaded.getLockVersion()); // cheap early exit, no write
        }
        if (requests.claim(loaded.getId(), expectedLockVersion, calendar.now()) == 0) {
            // someone committed between our read and our UPDATE — report the value they left behind
            int current = requests.findLockVersion(loaded.getId()).orElse(expectedLockVersion);
            throw DomainException.Conflict.staleLock(current);
        }
        return requests.findById(loaded.getId()).orElseThrow();
    }
}
