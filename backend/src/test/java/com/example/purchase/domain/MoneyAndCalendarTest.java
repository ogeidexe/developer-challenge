package com.example.purchase.domain;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class MoneyAndCalendarTest {

    @ParameterizedTest
    @CsvSource({"4899.90, 489990", "4899.9, 489990", "10, 1000", "0.01, 1", "9999999999999.99, 999999999999999"})
    void parsesDecimalStringsIntoExactCents(String input, long cents) {
        assertThat(Money.parse(input).cents()).isEqualTo(cents);
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "-1.00", "1.234", "1,00", "abc", "12345678901234.00"})
    void rejectsInvalidAmounts(String input) {
        assertThat(Money.isValid(input)).isFalse();
        assertThatThrownBy(() -> Money.parse(input)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void totalsAreExactWithoutFloatingPoint() {
        // README §3.3 example: 5 × 4899.90 = 24499.50
        assertThat(Money.parse("4899.90").times(5).toDecimalString()).isEqualTo("24499.50");
        assertThat(Money.sum(List.of(Money.parse("0.10"), Money.parse("0.20"))).toDecimalString()).isEqualTo("0.30");
    }

    @Test
    void competenceMonthUsesSaoPauloNotUtc() {
        var calendar = new BusinessCalendar(Clock.systemUTC());
        // 2026-10-31 23:55 in São Paulo (UTC-3) is already 2026-11-01 02:55 in UTC
        assertThat(calendar.competenceMonth(Instant.parse("2026-11-01T02:55:00Z"))).isEqualTo("2026-10");
        assertThat(calendar.competenceMonth(Instant.parse("2026-11-01T03:00:00Z"))).isEqualTo("2026-11");
    }

    @Test
    void neededByMustBeStrictlyAfterTheBusinessToday() {
        // 01:00 UTC on Nov 15 is still Nov 14 in São Paulo
        var calendar = new BusinessCalendar(Clock.fixed(Instant.parse("2026-11-15T01:00:00Z"), ZoneOffset.UTC));
        assertThat(calendar.today()).isEqualTo(LocalDate.of(2026, 11, 14));
        assertThat(calendar.isFuture(LocalDate.of(2026, 11, 14))).isFalse();
        assertThat(calendar.isFuture(LocalDate.of(2026, 11, 15))).isTrue();
    }
}
