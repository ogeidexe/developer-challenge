package com.example.purchase.domain;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;

/**
 * Business time in America/Sao_Paulo (README §2.3 rule 5). Storage stays UTC; only business derivations
 * (competence month, "today" for neededBy) use the business zone. The clock is injected so month-edge
 * behaviour is unit-testable.
 */
public final class BusinessCalendar {

    public static final ZoneId BUSINESS_ZONE = ZoneId.of("America/Sao_Paulo");
    private static final DateTimeFormatter YEAR_MONTH = DateTimeFormatter.ofPattern("yyyy-MM");

    private final Clock clock;

    public BusinessCalendar(Clock clock) { this.clock = clock; }

    public Instant now() { return clock.instant(); }

    public LocalDate today() { return LocalDate.now(clock.withZone(BUSINESS_ZONE)); }

    /** Competence month of a submission instant, e.g. 2026-10-31T23:55-03:00 (= 02:55Z on Nov 1) → "2026-10". */
    public String competenceMonth(Instant submittedAt) {
        return YearMonth.from(submittedAt.atZone(BUSINESS_ZONE)).format(YEAR_MONTH);
    }

    public String currentMonth() { return competenceMonth(now()); }

    /** neededBy must be strictly after today in the business zone (A-13). */
    public boolean isFuture(LocalDate date) { return date.isAfter(today()); }

    /** Start of a business day as a UTC instant (for createdFrom/createdTo filters). */
    public Instant startOfDay(LocalDate date) { return date.atStartOfDay(BUSINESS_ZONE).toInstant(); }

    public static boolean isValidYearMonth(String value) {
        return value != null && value.matches("^\\d{4}-(0[1-9]|1[0-2])$");
    }
}
