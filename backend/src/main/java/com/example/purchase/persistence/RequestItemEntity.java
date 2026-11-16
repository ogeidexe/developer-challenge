package com.example.purchase.persistence;

import com.example.purchase.domain.Money;
import jakarta.persistence.*;

import java.util.UUID;

/** Working-copy line item; replaced wholesale on edit. {@code line_total_cents} has a DB CHECK = qty × price. */
@Entity
@Table(name = "request_items")
public class RequestItemEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "request_id", nullable = false)
    private UUID requestId;

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

    protected RequestItemEntity() {}

    public RequestItemEntity(UUID requestId, int position, String description, int quantity, Money unitPrice) {
        this.requestId = requestId;
        this.position = position;
        this.description = description;
        this.quantity = quantity;
        this.unitPriceCents = unitPrice.cents();
        this.lineTotalCents = unitPrice.times(quantity).cents();
    }

    public int getPosition() { return position; }
    public String getDescription() { return description; }
    public int getQuantity() { return quantity; }
    public Money getUnitPrice() { return Money.ofCents(unitPriceCents); }
    public Money getLineTotal() { return Money.ofCents(lineTotalCents); }
}
