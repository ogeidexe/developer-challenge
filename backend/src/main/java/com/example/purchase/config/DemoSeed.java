package com.example.purchase.config;

import com.example.purchase.api.dto.RequestDtos.ItemInput;
import com.example.purchase.api.dto.RequestDtos.RequestDetail;
import com.example.purchase.api.dto.RequestDtos.RequestInput;
import com.example.purchase.api.dto.RequestDtos.RequestUpdateInput;
import com.example.purchase.application.PurchaseRequestService;
import com.example.purchase.application.TransitionFacade;
import com.example.purchase.domain.*;
import com.example.purchase.persistence.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;
import java.util.UUID;

/**
 * Demo data (README §5.4): 2 cost centers (CC-TI-01 almost exhausted), per center 1 SOLICITANTE + 1 APROVADOR
 * N1 + 1 APROVADOR N2, 2 global ADMINs, requests in every state. Fictional password for all: Kingspan@123.
 *
 * <p>Built through the real services, so history, versions, steps and budget consumption are genuine
 * (consumed amounts are backed by APPROVED requests — A-33). Runs in ONE transaction and only when its users
 * do not exist yet: a restart never re-seeds, never half-seeds and never touches the immutable tables.
 */
@Component
@ConditionalOnProperty(name = "app.seed.enabled", havingValue = "true")
public class DemoSeed implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(DemoSeed.class);
    public static final String PASSWORD = "Kingspan@123";

    private final UserRepository users;
    private final CostCenterRepository centers;
    private final BudgetRepository budgets;
    private final PasswordEncoder passwords;
    private final PurchaseRequestService requests;
    private final TransitionFacade transitions;
    private final BusinessCalendar calendar;
    private final TransactionTemplate tx;

    public DemoSeed(UserRepository users, CostCenterRepository centers, BudgetRepository budgets, PasswordEncoder passwords,
                    PurchaseRequestService requests, TransitionFacade transitions, BusinessCalendar calendar, TransactionTemplate tx) {
        this.users = users;
        this.centers = centers;
        this.budgets = budgets;
        this.passwords = passwords;
        this.requests = requests;
        this.transitions = transitions;
        this.calendar = calendar;
        this.tx = tx;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (users.existsByEmailIgnoreCase("admin1@kingspan.test")) {
            log.info("Demo seed already present — skipping");
            return;
        }
        MDC.put(RequestContext.MDC_KEY, "seed");
        try {
            tx.executeWithoutResult(status -> seed());
            // never log a credential (SEC-F11); the demo users and their password are documented in SOLUTION.md
            log.warn("Demo seed created: fictional users with a publicly documented password exist. "
                    + "Set SEED_ENABLED=false for any environment that is not a local demo.");
        } finally {
            MDC.remove(RequestContext.MDC_KEY);
        }
    }

    private void seed() {
        var ti = centers.save(new CostCenterEntity("CC-TI-01", "Tecnologia da Informação"));
        var adm = centers.save(new CostCenterEntity("CC-ADM-02", "Administrativo"));

        Actor solicTi = user("solic.ti@kingspan.test", "Sofia Lima", Role.SOLICITANTE, null, ti.getId());
        Actor aprov1Ti = user("aprov1.ti@kingspan.test", "João Nunes", Role.APROVADOR, ApproverLevel.NIVEL_1, ti.getId());
        Actor aprov2Ti = user("aprov2.ti@kingspan.test", "Maria Souza", Role.APROVADOR, ApproverLevel.NIVEL_2, ti.getId());
        Actor solicAdm = user("solic.adm@kingspan.test", "Carlos Reis", Role.SOLICITANTE, null, adm.getId());
        Actor aprov1Adm = user("aprov1.adm@kingspan.test", "Ana Costa", Role.APROVADOR, ApproverLevel.NIVEL_1, adm.getId());
        Actor aprov2Adm = user("aprov2.adm@kingspan.test", "Pedro Alves", Role.APROVADOR, ApproverLevel.NIVEL_2, adm.getId());
        Actor admin1 = user("admin1@kingspan.test", "Admin Um", Role.ADMIN, null, null);
        Actor admin2 = user("admin2@kingspan.test", "Admin Dois", Role.ADMIN, null, null);

        String month = calendar.currentMonth();
        budgets.save(new BudgetEntity(ti.getId(), month, Money.parse("50000.00")));
        budgets.save(new BudgetEntity(adm.getId(), month, Money.parse("80000.00")));
        budgets.flush(); // consumption below uses native UPDATEs

        // 1) TI · DRAFT
        create(solicTi, "Monitores para o time de suporte", Category.EQUIPMENT, item("Monitor 24\"", 8, "899.90"));

        // 2) TI · pending at N1 — R$ 900,00 (approving it shows BUDGET_EXCEEDED: only R$ 800,00 will be left)
        submit(solicTi, create(solicTi, "Kit periféricos estoque", Category.SUPPLIES, item("Teclado e mouse sem fio", 10, "90.00")));

        // 3) TI · pending at N2 — R$ 5.000,00 → [N1, N2]
        var switchReq = submit(solicTi, create(solicTi, "Switch rede predial", Category.EQUIPMENT, item("Switch gerenciável 48 portas", 1, "5000.00")));
        approve(aprov1Ti, switchReq, "Dentro do planejado.");

        // 4) TI · CHANGES_REQUESTED — returned at N1; the owner already edited the working copy (35 licenses)
        var antivirus = submit(solicTi, create(solicTi, "Antivírus corporativo", Category.SOFTWARE, item("Licença anual de antivírus corporativo", 40, "120.00")));
        antivirus = transitions.requestChanges(aprov1Ti, antivirus.id(), antivirus.lockVersion(), "Reduzir para 35 licenças e detalhar justificativa.");
        requests.update(solicTi, antivirus.id(), new RequestUpdateInput(antivirus.title(), "Renovação anual (ajustada para 35 licenças).",
                Category.SOFTWARE, null, null, List.of(item("Licença anual de antivírus corporativo", 35, "120.00")), antivirus.lockVersion()));

        // 5) TI · APPROVED R$ 49.200,00 → consumes CC-TI-01 down to R$ 800,00
        var server = submit(solicTi, create(solicTi, "Servidor virtualização", Category.EQUIPMENT, item("Servidor para virtualização", 1, "49200.00")));
        server = approve(aprov1Ti, server, null);
        server = approve(aprov2Ti, server, null);
        approve(admin1, server, "Orçamento aprovado no plano anual.");

        // 6) TI · REJECTED at N1
        var drone = submit(solicTi, create(solicTi, "Drone inspeção", Category.EQUIPMENT, item("Drone para inspeção externa", 1, "15000.00")));
        transitions.reject(aprov1Ti, drone.id(), drone.lockVersion(), "Fora do escopo aprovado para este semestre.");

        // 7) ADM · pending at ADMIN — R$ 24.499,50 (the video flow: approve as admin1 or admin2)
        var notebooks = submit(solicAdm, create(solicAdm, "Notebooks para o time de TI", Category.EQUIPMENT, item("Notebook 16GB/512GB", 5, "4899.90")));
        notebooks = approve(aprov1Adm, notebooks, "De acordo com o inventário.");
        approve(aprov2Adm, notebooks, "Dentro do planejado do trimestre.");

        // 8) ADM · APPROVED R$ 12.000,00 → consumes CC-ADM-02
        var hvac = submit(solicAdm, create(solicAdm, "Climatização sala de reunião", Category.SERVICES, item("Ar-condicionado 12000 BTU", 2, "6000.00")));
        hvac = approve(aprov1Adm, hvac, null);
        hvac = approve(aprov2Adm, hvac, null);
        approve(admin2, hvac, "Orçamento disponível.");

        // 9) ADM · CANCELLED while still a draft
        var projector = create(solicAdm, "Projetor multimídia", Category.EQUIPMENT, item("Projetor multimídia", 1, "4500.00"));
        transitions.cancel(solicAdm, projector.id(), projector.lockVersion());

        // 10) ADM · SOFTWARE pending at N1 — R$ 3.000,00 → [N1, N2] + ADMIN (SOFTWARE rule)
        submit(solicAdm, create(solicAdm, "Plataforma e-sign", Category.SOFTWARE, item("Assinatura anual plataforma de e-sign", 1, "3000.00")));
    }

    // ---------- helpers ----------

    private Actor user(String email, String name, Role role, ApproverLevel level, UUID costCenterId) {
        return users.save(new UserEntity(email, passwords.encode(PASSWORD), name, role, level, costCenterId)).toActor();
    }

    private static ItemInput item(String description, int quantity, String unitPrice) {
        return new ItemInput(description, quantity, unitPrice);
    }

    private RequestDetail create(Actor owner, String title, Category category, ItemInput item) {
        return requests.create(owner, new RequestInput(title, null, category, null, calendar.today().plusDays(30), List.of(item)));
    }

    private RequestDetail submit(Actor owner, RequestDetail request) {
        return transitions.submit(owner, request.id(), request.lockVersion());
    }

    private RequestDetail approve(Actor approver, RequestDetail request, String comment) {
        return transitions.approve(approver, request.id(), request.lockVersion(), comment);
    }
}
