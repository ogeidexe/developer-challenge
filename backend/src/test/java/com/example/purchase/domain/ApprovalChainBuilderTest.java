package com.example.purchase.domain;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.EnumSource;

import java.util.Arrays;
import java.util.List;

import static com.example.purchase.domain.StepLevel.*;
import static org.assertj.core.api.Assertions.assertThat;

class ApprovalChainBuilderTest {

    /** README §2.3 value bands, checked exactly at the cent boundaries. */
    @ParameterizedTest(name = "{0} {1} → {2}")
    @CsvSource({
            "0.01,      EQUIPMENT, NIVEL_1",
            "1000.00,   EQUIPMENT, NIVEL_1",
            "1000.01,   EQUIPMENT, NIVEL_1>NIVEL_2",
            "10000.00,  EQUIPMENT, NIVEL_1>NIVEL_2",
            "10000.01,  EQUIPMENT, NIVEL_1>NIVEL_2>ADMIN",
            "999999.99, SERVICES,  NIVEL_1>NIVEL_2>ADMIN",
            // SOFTWARE always ends with ADMIN, never duplicated
            "500.00,    SOFTWARE,  NIVEL_1>ADMIN",
            "1000.00,   SOFTWARE,  NIVEL_1>ADMIN",
            "3000.00,   SOFTWARE,  NIVEL_1>NIVEL_2>ADMIN",
            "10000.00,  SOFTWARE,  NIVEL_1>NIVEL_2>ADMIN",
            "50000.00,  SOFTWARE,  NIVEL_1>NIVEL_2>ADMIN",
    })
    void buildsTheChainFromValueAndCategory(String total, Category category, String expected) {
        List<StepLevel> chain = ApprovalChainBuilder.build(Money.parse(total), category);

        assertThat(chain).containsExactlyElementsOf(Arrays.stream(expected.split(">")).map(StepLevel::valueOf).toList());
    }

    @ParameterizedTest
    @EnumSource(Category.class)
    void adminAppearsAtMostOnceAndAlwaysLast(Category category) {
        for (String total : List.of("1.00", "1000.01", "10000.01", "123456.78")) {
            List<StepLevel> chain = ApprovalChainBuilder.build(Money.parse(total), category);
            assertThat(chain.stream().filter(l -> l == ADMIN).count()).isLessThanOrEqualTo(1);
            if (chain.contains(ADMIN)) assertThat(chain.getLast()).isEqualTo(ADMIN);
            assertThat(chain.getFirst()).isEqualTo(NIVEL_1);
        }
    }

    @Test
    void theChainIsImmutable() {
        List<StepLevel> chain = ApprovalChainBuilder.build(Money.parse("10.00"), Category.OTHER);
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> chain.add(ADMIN)).isInstanceOf(UnsupportedOperationException.class);
    }
}
