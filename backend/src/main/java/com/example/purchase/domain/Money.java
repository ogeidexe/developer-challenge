package com.example.purchase.domain;

import java.text.NumberFormat;
import java.util.Collection;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * BRL amount as integer cents (ADR-005): exact arithmetic, no rounding anywhere. Serialized as a decimal
 * string with two fraction digits ("4899.90"), the format of the README example.
 */
public record Money(long cents) implements Comparable<Money> {

    public static final Money ZERO = new Money(0);
    private static final Pattern DECIMAL = Pattern.compile("^(\\d{1,13})(?:\\.(\\d{1,2}))?$");

    public Money {
        if (cents < 0) throw new IllegalArgumentException("Money cannot be negative: " + cents);
    }

    public static Money ofCents(long cents) { return new Money(cents); }

    /** Parses "4899.9" / "4899.90" / "10". Up to 13 integer digits and 2 fraction digits. */
    public static Money parse(String decimal) {
        var m = DECIMAL.matcher(decimal == null ? "" : decimal.trim());
        if (!m.matches()) throw new IllegalArgumentException("Invalid money amount: " + decimal);
        long integer = Long.parseLong(m.group(1));
        String fraction = m.group(2) == null ? "00" : (m.group(2) + "0").substring(0, 2);
        return new Money(Math.addExact(Math.multiplyExact(integer, 100), Long.parseLong(fraction)));
    }

    public static boolean isValid(String decimal) {
        return decimal != null && DECIMAL.matcher(decimal.trim()).matches();
    }

    public static Money sum(Collection<Money> amounts) {
        return amounts.stream().reduce(ZERO, Money::plus);
    }

    public Money plus(Money other) { return new Money(Math.addExact(cents, other.cents)); }

    public Money minus(Money other) { return new Money(Math.subtractExact(cents, other.cents)); }

    public Money times(int quantity) { return new Money(Math.multiplyExact(cents, quantity)); }

    public boolean isGreaterThan(Money other) { return cents > other.cents; }

    /** "4899.90" — the API wire format. */
    public String toDecimalString() {
        return "%d.%02d".formatted(cents / 100, cents % 100);
    }

    /** "R$ 4.899,90" — for user-facing messages (README §3.3 example). */
    public String toBrl() {
        return NumberFormat.getCurrencyInstance(Locale.of("pt", "BR")).format(cents / 100.0);
    }

    @Override
    public int compareTo(Money other) { return Long.compare(cents, other.cents); }

    @Override
    public String toString() { return toDecimalString(); }
}
