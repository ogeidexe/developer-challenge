package com.example.purchase.domain;

/**
 * A-31: the step that was current when the request was decided records the outcome; later steps of a
 * closed version become {@link #SKIPPED}. A closed version never keeps a {@link #PENDING} step.
 */
public enum StepStatus { PENDING, APPROVED, REJECTED, RETURNED, CANCELLED, SKIPPED }
