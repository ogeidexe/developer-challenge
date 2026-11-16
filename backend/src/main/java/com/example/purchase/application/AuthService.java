package com.example.purchase.application;

import com.example.purchase.api.dto.AdminDtos.*;
import com.example.purchase.domain.Actor;
import com.example.purchase.domain.DomainException;
import com.example.purchase.domain.ErrorCode;
import com.example.purchase.domain.Role;
import com.example.purchase.persistence.CostCenterRepository;
import com.example.purchase.persistence.UserEntity;
import com.example.purchase.persistence.UserRepository;
import com.example.purchase.security.JwtService;
import com.example.purchase.security.LoginAttemptLimiter;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {

    private final UserRepository users;
    private final CostCenterRepository centers;
    private final PasswordEncoder passwords;
    private final JwtService jwt;
    private final LoginAttemptLimiter limiter;
    /** Compared against when the e-mail is unknown, so a miss costs the same time as a hit (no user enumeration). */
    private final String dummyHash;

    public AuthService(UserRepository users, CostCenterRepository centers, PasswordEncoder passwords, JwtService jwt,
                       LoginAttemptLimiter limiter) {
        this.users = users;
        this.centers = centers;
        this.passwords = passwords;
        this.jwt = jwt;
        this.limiter = limiter;
        this.dummyHash = passwords.encode("timing-equalizer-not-a-real-password");
    }

    /** Public sign-up: ALWAYS a SOLICITANTE (README §1.1), bound to an existing cost center (SEC-006). */
    @Transactional
    public UserDto register(RegisterInput in) {
        PasswordRules.requireBcryptCompatible(in.password());
        if (users.existsByEmailIgnoreCase(in.email())) {
            throw new DomainException.Conflict(ErrorCode.EMAIL_ALREADY_REGISTERED, "E-mail já cadastrado.", null);
        }
        if (!centers.existsById(in.costCenterId())) throw DomainException.Invalid.field("costCenterId", "Centro de custo não encontrado.");
        var user = new UserEntity(in.email().strip(), passwords.encode(in.password()), in.name().strip(), Role.SOLICITANTE, null, in.costCenterId());
        return UserMapping.toDto(users.save(user));
    }

    @Transactional(readOnly = true)
    public UserDto me(Actor actor) {
        return users.findById(actor.id()).map(UserMapping::toDto).orElseThrow(() -> new DomainException.NotFound("Usuário não encontrado."));
    }

    /**
     * Same 401 message for every failure (no user enumeration); throttled per account and per client address
     * (SEC-F01): while blocked, even the right password gets 429.
     */
    @Transactional(readOnly = true)
    public LoginResponse login(LoginInput in, String clientAddress) {
        String email = in.email().strip();
        limiter.checkAllowed(email, clientAddress);
        // a password bcrypt cannot hash can never match a stored hash — compare a dummy to keep the timing flat
        boolean hashable = PasswordRules.fitsBcrypt(in.password());
        var user = hashable ? users.findByEmailIgnoreCase(email).orElse(null) : null;
        boolean ok = passwords.matches(hashable ? in.password() : "x", user != null ? user.getPasswordHash() : dummyHash);
        if (user == null || !ok || !user.isActive()) {
            limiter.recordFailure(email, clientAddress);
            throw new BadCredentialsException("E-mail ou senha inválidos.");
        }
        limiter.recordSuccess(email);
        var token = jwt.issue(user);
        return new LoginResponse(token.value(), "Bearer", token.expiresInSeconds(), UserMapping.toDto(user));
    }
}
