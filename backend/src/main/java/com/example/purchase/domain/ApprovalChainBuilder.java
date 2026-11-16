package com.example.purchase.domain;

import java.util.ArrayList;
import java.util.List;

/**
 * Builds the ordered approval chain of a version (README §2.3):
 * <pre>
 *   total ≤ R$ 1.000,00                → NIVEL_1
 *   R$ 1.000,01 … R$ 10.000,00         → NIVEL_1 → NIVEL_2
 *   total > R$ 10.000,00               → NIVEL_1 → NIVEL_2 → ADMIN
 *   category SOFTWARE                  → always ends with ADMIN (never duplicated)
 * </pre>
 * Boundaries are compared in integer cents, so R$ 1.000,00 vs R$ 1.000,01 is exact.
 */
public final class ApprovalChainBuilder {

    static final Money LEVEL_1_LIMIT = Money.ofCents(100_000);    // R$ 1.000,00
    static final Money LEVEL_2_LIMIT = Money.ofCents(1_000_000);  // R$ 10.000,00

    private ApprovalChainBuilder() {}

    public static List<StepLevel> build(Money total, Category category) {
        var levels = new ArrayList<StepLevel>(3);
        levels.add(StepLevel.NIVEL_1);
        if (total.isGreaterThan(LEVEL_1_LIMIT)) levels.add(StepLevel.NIVEL_2);
        // a single condition adds ADMIN, so it can never appear twice
        if (total.isGreaterThan(LEVEL_2_LIMIT) || category == Category.SOFTWARE) levels.add(StepLevel.ADMIN);
        return List.copyOf(levels);
    }
}
