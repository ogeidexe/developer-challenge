package com.example.purchase.persistence;

import com.example.purchase.domain.Actor;
import com.example.purchase.domain.ApproverLevel;
import com.example.purchase.domain.Role;
import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "users")
public class UserEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, unique = true)
    private String email;

    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    @Column(nullable = false)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Role role;

    @Enumerated(EnumType.STRING)
    @Column(name = "approver_level")
    private ApproverLevel approverLevel;

    @Column(name = "cost_center_id")
    private UUID costCenterId;

    @Column(nullable = false)
    private boolean active = true;

    /** Optimistic lock for admin edits, managed explicitly (compared with the client value, then incremented). */
    @Column(name = "lock_version", nullable = false)
    private int lockVersion = 1;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected UserEntity() {}

    public UserEntity(String email, String passwordHash, String name, Role role, ApproverLevel approverLevel, UUID costCenterId) {
        this.email = email.toLowerCase();
        this.passwordHash = passwordHash;
        this.name = name;
        this.role = role;
        this.approverLevel = approverLevel;
        this.costCenterId = costCenterId;
    }

    public Actor toActor() { return new Actor(id, name, role, approverLevel, costCenterId); }

    public void changeProfile(String name, Role role, ApproverLevel level, UUID costCenterId, boolean active) {
        this.name = name;
        this.role = role;
        this.approverLevel = level;
        this.costCenterId = costCenterId;
        this.active = active;
        this.lockVersion++;
    }

    public UUID getId() { return id; }
    public String getEmail() { return email; }
    public String getPasswordHash() { return passwordHash; }
    public String getName() { return name; }
    public Role getRole() { return role; }
    public ApproverLevel getApproverLevel() { return approverLevel; }
    public UUID getCostCenterId() { return costCenterId; }
    public boolean isActive() { return active; }
    public int getLockVersion() { return lockVersion; }
    public Instant getCreatedAt() { return createdAt; }
}
