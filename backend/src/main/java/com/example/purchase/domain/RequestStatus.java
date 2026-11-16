package com.example.purchase.domain;

public enum RequestStatus {
    DRAFT, PENDING_APPROVAL, CHANGES_REQUESTED, APPROVED, REJECTED, CANCELLED;

    /** APPROVED, REJECTED and CANCELLED block every action (README §4.2). */
    public boolean isFinal() {
        return this == APPROVED || this == REJECTED || this == CANCELLED;
    }

    /** Only DRAFT and CHANGES_REQUESTED can be edited, and only by the owner (README §2.2). */
    public boolean isEditable() {
        return this == DRAFT || this == CHANGES_REQUESTED;
    }
}
