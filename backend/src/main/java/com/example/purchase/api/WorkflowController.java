package com.example.purchase.api;

import com.example.purchase.api.dto.CommonDtos.PageResponse;
import com.example.purchase.api.dto.RequestDtos.DashboardSummary;
import com.example.purchase.api.dto.RequestDtos.InboxItem;
import com.example.purchase.application.DashboardService;
import com.example.purchase.application.InboxService;
import com.example.purchase.security.CurrentUser;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/** GET /approvals/inbox and GET /dashboard/summary. */
@RestController
public class WorkflowController {

    private final CurrentUser currentUser;
    private final InboxService inbox;
    private final DashboardService dashboard;

    public WorkflowController(CurrentUser currentUser, InboxService inbox, DashboardService dashboard) {
        this.currentUser = currentUser;
        this.inbox = inbox;
        this.dashboard = dashboard;
    }

    @GetMapping("/approvals/inbox")
    public PageResponse<InboxItem> inbox(@RequestParam(defaultValue = "0") int page,
                                         @RequestParam(defaultValue = "20") int size,
                                         @RequestParam(required = false) UUID costCenterId) {
        return inbox.inbox(currentUser.get(), costCenterId, page, size);
    }

    @GetMapping("/dashboard/summary")
    public DashboardSummary dashboard() {
        return dashboard.summary(currentUser.get());
    }
}
