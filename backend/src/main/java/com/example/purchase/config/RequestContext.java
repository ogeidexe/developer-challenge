package com.example.purchase.config;

import org.slf4j.MDC;

/** Correlation id of the current HTTP request (set by {@code RequestIdFilter}), also written to every audit event. */
public final class RequestContext {

    public static final String HEADER = "X-Request-Id";
    public static final String MDC_KEY = "requestId";

    private RequestContext() {}

    public static String requestId() {
        String id = MDC.get(MDC_KEY);
        return id != null ? id : "system";
    }
}
