package com.example.purchase.application;

import com.example.purchase.api.dto.AdminDtos.CreateUserInput;
import com.example.purchase.api.dto.AdminDtos.UpdateUserInput;
import com.example.purchase.api.dto.AdminDtos.UserDto;
import com.example.purchase.api.dto.CommonDtos.PageResponse;
import com.example.purchase.domain.*;
import com.example.purchase.persistence.CostCenterRepository;
import com.example.purchase.persistence.UserEntity;
import com.example.purchase.persistence.UserRepository;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

/** ADMIN creates and edits users of any role and level (README §2.1). */
@Service
public class UserAdminService {

    private final UserRepository users;
    private final CostCenterRepository centers;
    private final PasswordEncoder passwords;

    public UserAdminService(UserRepository users, CostCenterRepository centers, PasswordEncoder passwords) {
        this.users = users;
        this.centers = centers;
        this.passwords = passwords;
    }

    @Transactional(readOnly = true)
    public PageResponse<UserDto> list(Actor actor, Role role, UUID costCenterId, String q, int page, int size) {
        RequestAccess.requireAdmin(actor, "listar usuários");
        Specification<UserEntity> spec = (root, query, cb) -> {
            List<Predicate> p = new ArrayList<>();
            if (role != null) p.add(cb.equal(root.get("role"), role));
            if (costCenterId != null) p.add(cb.equal(root.get("costCenterId"), costCenterId));
            if (q != null && !q.isBlank()) {
                String like = RequestSpecifications.containsPattern("q", q); // wildcards escaped (SEC-F09)
                p.add(cb.or(cb.like(cb.lower(root.<String>get("name")), like, RequestSpecifications.LIKE_ESCAPE),
                        cb.like(cb.lower(root.<String>get("email")), like, RequestSpecifications.LIKE_ESCAPE)));
            }
            return cb.and(p.toArray(Predicate[]::new));
        };
        var pageable = PageRequest.of(Math.max(page, 0), Math.clamp(size, 1, RequestQueryService.MAX_PAGE_SIZE), Sort.by("name"));
        return PageResponse.from(users.findAll(spec, pageable), UserMapping::toDto);
    }

    @Transactional
    public UserDto create(Actor actor, CreateUserInput in) {
        RequestAccess.requireAdmin(actor, "criar usuários");
        PasswordRules.requireBcryptCompatible(in.password());
        validateProfile(in.role(), in.approverLevel(), in.costCenterId());
        if (users.existsByEmailIgnoreCase(in.email())) {
            throw new DomainException.Conflict(ErrorCode.EMAIL_ALREADY_REGISTERED, "E-mail já cadastrado.", null);
        }
        var user = new UserEntity(in.email().strip(), passwords.encode(in.password()), in.name().strip(),
                in.role(), in.approverLevel(), in.costCenterId());
        return UserMapping.toDto(users.save(user));
    }

    @Transactional
    public UserDto update(Actor actor, UUID id, UpdateUserInput in) {
        RequestAccess.requireAdmin(actor, "editar usuários");
        var user = users.findById(id).orElseThrow(() -> new DomainException.NotFound("Usuário não encontrado."));
        if (user.getLockVersion() != in.lockVersion()) {
            throw new DomainException.Conflict(ErrorCode.CONCURRENCY_CONFLICT,
                    "O usuário foi alterado por outro administrador (lockVersion atual: %d).".formatted(user.getLockVersion()), user.getLockVersion());
        }
        Role role = Objects.requireNonNullElse(in.role(), user.getRole());
        // changing the role away from APROVADOR drops the level; otherwise keep the current one unless sent
        // (may stay null → validateProfile answers 400 "Obrigatório para APROVADOR")
        ApproverLevel level = role != Role.APROVADOR ? null
                : in.approverLevel() != null ? in.approverLevel() : user.getApproverLevel();
        UUID costCenterId = in.costCenterId() != null ? in.costCenterId() : user.getCostCenterId();
        validateProfile(role, level, costCenterId);
        user.changeProfile(in.name() != null ? in.name().strip() : user.getName(), role, level, costCenterId,
                Objects.requireNonNullElse(in.active(), user.isActive()));
        return UserMapping.toDto(user);
    }

    /** Level required iff APROVADOR; only an ADMIN may be global (no cost center); the center must exist. */
    private void validateProfile(Role role, ApproverLevel level, UUID costCenterId) {
        var errors = new ArrayList<DomainException.FieldError>();
        if (role == Role.APROVADOR && level == null) errors.add(new DomainException.FieldError("approverLevel", "Obrigatório para APROVADOR.", "REQUIRED"));
        if (role != Role.APROVADOR && level != null) errors.add(new DomainException.FieldError("approverLevel", "Somente APROVADOR possui nível.", "INVALID"));
        if (costCenterId == null && role != Role.ADMIN) errors.add(new DomainException.FieldError("costCenterId", "Somente ADMIN pode ser global (sem centro de custo).", "REQUIRED"));
        if (costCenterId != null && !centers.existsById(costCenterId)) errors.add(new DomainException.FieldError("costCenterId", "Centro de custo não encontrado.", "INVALID"));
        if (!errors.isEmpty()) throw new DomainException.Invalid(ErrorCode.VALIDATION_FAILED, "Um ou mais campos são inválidos.", errors);
    }
}
