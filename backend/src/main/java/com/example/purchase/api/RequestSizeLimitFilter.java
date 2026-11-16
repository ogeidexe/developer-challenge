package com.example.purchase.api;

import com.example.purchase.config.AppProperties;
import com.example.purchase.security.ProblemResponses;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;

/**
 * Caps request bodies (SEC-F03, CWE-770). Tomcat's max-http-form-post-size only covers form posts, so without
 * this a JSON body of any size — including on the unauthenticated /auth/login — would be read and parsed into
 * memory before bean validation could reject it. The largest legitimate body (50 items) is a few tens of KiB.
 *
 * <p>A declared Content-Length above the limit is refused with 413 before anything is read. A chunked body
 * (no Content-Length) is counted while it is read; crossing the limit aborts parsing with
 * {@link PayloadTooLargeException}, which the GlobalExceptionHandler also answers with 413.
 * Runs right after {@link RequestIdFilter} and before the security chain.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 1)
public class RequestSizeLimitFilter extends OncePerRequestFilter {

    private final long maxBytes;
    private final ProblemResponses problems;

    public RequestSizeLimitFilter(AppProperties props, ProblemResponses problems) {
        this.maxBytes = props.security().maxRequestBody().toBytes();
        this.problems = problems;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        long declared = request.getContentLengthLong();
        if (declared > maxBytes) {
            problems.payloadTooLarge(response, maxBytes);
            return;
        }
        // with a declared length the container never reads past it; only unknown-length bodies need counting
        chain.doFilter(declared >= 0 ? request : new LimitedRequest(request, maxBytes), response);
    }

    /** Thrown while reading a chunked body that exceeds the limit. */
    public static final class PayloadTooLargeException extends IOException {
        public PayloadTooLargeException(long maxBytes) {
            super("Request body larger than " + maxBytes + " bytes");
        }
    }

    private static final class LimitedRequest extends HttpServletRequestWrapper {

        private final long maxBytes;
        private ServletInputStream stream;

        LimitedRequest(HttpServletRequest request, long maxBytes) {
            super(request);
            this.maxBytes = maxBytes;
        }

        @Override
        public ServletInputStream getInputStream() throws IOException {
            if (stream == null) stream = new LimitedInputStream(super.getInputStream(), maxBytes);
            return stream;
        }

        @Override
        public BufferedReader getReader() throws IOException {
            String encoding = getCharacterEncoding();
            Charset charset = encoding != null ? Charset.forName(encoding) : StandardCharsets.UTF_8;
            return new BufferedReader(new InputStreamReader(getInputStream(), charset));
        }
    }

    private static final class LimitedInputStream extends ServletInputStream {

        private final ServletInputStream delegate;
        private final long maxBytes;
        private long count;

        LimitedInputStream(ServletInputStream delegate, long maxBytes) {
            this.delegate = delegate;
            this.maxBytes = maxBytes;
        }

        @Override
        public int read() throws IOException {
            int b = delegate.read();
            if (b != -1) add(1);
            return b;
        }

        @Override
        public int read(byte[] buffer, int offset, int length) throws IOException {
            int n = delegate.read(buffer, offset, length);
            if (n > 0) add(n);
            return n;
        }

        private void add(long n) throws PayloadTooLargeException {
            count += n;
            if (count > maxBytes) throw new PayloadTooLargeException(maxBytes);
        }

        @Override
        public boolean isFinished() {
            return delegate.isFinished();
        }

        @Override
        public boolean isReady() {
            return delegate.isReady();
        }

        @Override
        public void setReadListener(ReadListener listener) {
            delegate.setReadListener(listener);
        }
    }
}
