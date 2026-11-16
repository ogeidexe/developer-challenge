package com.example.purchase.domain;

import java.util.Objects;
import java.util.UUID;

/**
 * The authenticated user as the domain sees it — always loaded from the database, never trusted from token
 * claims (role/level/cost center may have changed since the token was issued).
 */
public record Actor(UUID id, String name, Role role, ApproverLevel approverLevel, UUID costCenterId) {

    public Actor {
        Objects.requireNonNull(id, "id");
        Objects.requireNonNull(role, "role");
        if (role == Role.APROVADOR && approverLevel == null) {
            throw new IllegalArgumentException("APROVADOR requires an approver level");
        }
    }

    public boolean isAdmin() { return role == Role.ADMIN; }

    public boolean is(UUID userId) { return id.equals(userId); }
}
