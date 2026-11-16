package com.example.purchase.api;

import com.example.purchase.api.dto.AdminDtos.*;
import com.example.purchase.api.dto.CommonDtos.PageResponse;
import com.example.purchase.application.AuthService;
import com.example.purchase.application.CostCenterService;
import com.example.purchase.application.UserAdminService;
import com.example.purchase.domain.Money;
import com.example.purchase.domain.Role;
import com.example.purchase.security.CurrentUser;
import com.example.purchase.security.SessionStore;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/** /auth, /users and /cost-centers (+ monthly budgets). ADMIN-only rules are enforced in the services. */
@RestController
public class AdminController {

    private final CurrentUser currentUser;
    private final AuthService auth;
    private final UserAdminService users;
    private final CostCenterService centers;
    private final SessionStore sessions;

    public AdminController(CurrentUser currentUser, AuthService auth, UserAdminService users, CostCenterService centers,
                           SessionStore sessions) {
        this.currentUser = currentUser;
        this.auth = auth;
        this.users = users;
        this.centers = centers;
        this.sessions = sessions;
    }

    // ---------- auth ----------

    @PostMapping("/auth/register")
    @ResponseStatus(HttpStatus.CREATED)
    public UserDto register(@Valid @RequestBody RegisterInput body) {
        return auth.register(body);
    }

    @PostMapping("/auth/login")
    public LoginResponse login(@Valid @RequestBody LoginInput body, HttpServletRequest request) {
        // the TCP peer, never a client-supplied X-Forwarded-For (spoofable); behind a trusted reverse proxy set
        // server.forward-headers-strategy so this becomes the real client address (SEC-F01)
        return auth.login(body, request.getRemoteAddr());
    }

    /** Ends the caller's Redis session: the token is rejected (401) from the next request on (ADR-015). */
    @PostMapping("/auth/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logout(@AuthenticationPrincipal Jwt jwt) {
        sessions.close(jwt.getId());
    }

    @GetMapping("/auth/me")
    public UserDto me() {
        return auth.me(currentUser.get());
    }

    // ---------- users ----------

    @GetMapping("/users")
    public PageResponse<UserDto> listUsers(@RequestParam(defaultValue = "0") int page,
                                           @RequestParam(defaultValue = "20") int size,
                                           @RequestParam(required = false) Role role,
                                           @RequestParam(required = false) UUID costCenterId,
                                           @RequestParam(required = false) String q) {
        return users.list(currentUser.get(), role, costCenterId, q, page, size);
    }

    @PostMapping("/users")
    @ResponseStatus(HttpStatus.CREATED)
    public UserDto createUser(@Valid @RequestBody CreateUserInput body) {
        return users.create(currentUser.get(), body);
    }

    @PatchMapping("/users/{id}")
    public UserDto updateUser(@PathVariable UUID id, @Valid @RequestBody UpdateUserInput body) {
        return users.update(currentUser.get(), id, body);
    }

    // ---------- cost centers & budgets ----------

    @GetMapping("/cost-centers")
    public List<CostCenterDto> listCostCenters() {
        return centers.list();
    }

    @PostMapping("/cost-centers")
    @ResponseStatus(HttpStatus.CREATED)
    public CostCenterDto createCostCenter(@Valid @RequestBody CreateCostCenterInput body) {
        return centers.create(currentUser.get(), body);
    }

    @GetMapping("/cost-centers/{id}/budgets/{yearMonth}")
    public BudgetDto getBudget(@PathVariable UUID id, @PathVariable String yearMonth) {
        currentUser.get(); // any authenticated user
        return centers.getBudget(id, yearMonth);
    }

    @PutMapping("/cost-centers/{id}/budgets/{yearMonth}")
    public BudgetDto setBudget(@PathVariable UUID id, @PathVariable String yearMonth, @Valid @RequestBody SetBudgetInput body) {
        return centers.setBudget(currentUser.get(), id, yearMonth, Money.parse(body.amount()));
    }
}
