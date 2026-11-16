package com.example.purchase.security;

import com.example.purchase.domain.Actor;
import com.example.purchase.persistence.UserEntity;
import com.example.purchase.persistence.UserRepository;
import org.springframework.security.authentication.AuthenticationCredentialsNotFoundException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;

import java.util.UUID;

/**
 * Resolves the authenticated {@link Actor} from the database (not from token claims): a deactivated user or a
 * role change takes effect on the next request, not after the token expires.
 */
@Component
public class CurrentUser {

    private final UserRepository users;

    public CurrentUser(UserRepository users) {
        this.users = users;
    }

    public Actor get() {
        if (SecurityContextHolder.getContext().getAuthentication() instanceof JwtAuthenticationToken token) {
            UUID id = UUID.fromString(token.getToken().getSubject());
            return users.findById(id)
                    .filter(UserEntity::isActive)
                    .map(UserEntity::toActor)
                    .orElseThrow(() -> new BadCredentialsException("Usuário inexistente ou inativo."));
        }
        throw new AuthenticationCredentialsNotFoundException("Autenticação ausente.");
    }
}
