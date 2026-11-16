package com.example.purchase.persistence;

import com.example.purchase.domain.Money;
import jakarta.persistence.*;
import org.hibernate.annotations.Immutable;

import java.util.UUID;

@Entity
@Immutable
@Table(name = "version_items")
public class VersionItemEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "version_id", nullable = false)
    private UUID versionId;

    @Column(nullable = false)
    private int position;

    @Column(nullable = false)
    private String description;

    @Column(nullable = false)
    private int quantity;

    @Column(name = "unit_price_cents", nullable = false)
    private long unitPriceCents;

    @Column(name = "line_total_cents", nullable = false)
    private long lineTotalCents;

    protected VersionItemEntity() {}

    public VersionItemEntity(UUID versionId, RequestItemEntity source) {
        this.versionId = versionId;
        this.position = source.getPosition();
        this.description = source.getDescription();
        this.quantity = source.getQuantity();
        this.unitPriceCents = source.getUnitPrice().cents();
        this.lineTotalCents = source.getLineTotal().cents();
    }

    public int getPosition() { return position; }
    public String getDescription() { return description; }
    public int getQuantity() { return quantity; }
    public Money getUnitPrice() { return Money.ofCents(unitPriceCents); }
    public Money getLineTotal() { return Money.ofCents(lineTotalCents); }
}
