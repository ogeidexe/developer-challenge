package com.example.purchase.api.dto;

import com.example.purchase.domain.ApproverLevel;
import com.example.purchase.domain.Role;
import jakarta.validation.constraints.*;

import java.time.Instant;
import java.util.UUID;

/** Auth, users, cost centers and budgets. Passwords/hashes never appear in any output type. */
public final class AdminDtos {

    private AdminDtos() {}

    /** Password policy shared by public sign-up and admin-created users (SEC-F12); byte limit in PasswordRules. */
    public static final String PASSWORD_PATTERN = "^(?=.*[A-Za-z])(?=.*\\d).+$";
    public static final String PASSWORD_MESSAGE = "deve ter letras e dígitos";

    public record RegisterInput(
            @NotBlank @Email @Size(max = 254) String email,
            @NotBlank @Size(min = 8, max = 72) @Pattern(regexp = PASSWORD_PATTERN, message = PASSWORD_MESSAGE) String password,
            @NotBlank @Size(min = 2, max = 120) String name,
            @NotNull UUID costCenterId) {}

    /** Upper bounds keep oversized values away from the database and bcrypt (SEC-F05). */
    public record LoginInput(@NotBlank @Size(max = 254) String email, @NotBlank @Size(max = 128) String password) {}

    public record LoginResponse(String token, String tokenType, long expiresIn, UserDto user) {}

    public record UserDto(UUID id, String email, String name, Role role, ApproverLevel approverLevel,
                          UUID costCenterId, boolean active, Instant createdAt, int lockVersion) {}

    public record CreateUserInput(
            @NotBlank @Email @Size(max = 254) String email,
            @NotBlank @Size(min = 8, max = 72) @Pattern(regexp = PASSWORD_PATTERN, message = PASSWORD_MESSAGE) String password,
            @NotBlank @Size(min = 2, max = 120) String name,
            @NotNull Role role,
            ApproverLevel approverLevel,
            UUID costCenterId) {}

    /** PATCH: absent fields keep their value; lockVersion guards concurrent admin edits. */
    public record UpdateUserInput(
            @Size(min = 2, max = 120) String name,
            Role role,
            ApproverLevel approverLevel,
            UUID costCenterId,
            Boolean active,
            @NotNull @Min(1) Integer lockVersion) {}

    public record CostCenterDto(UUID id, String code, String name, boolean active) {}

    public record CreateCostCenterInput(@NotBlank @Size(min = 2, max = 30) String code,
                                        @NotBlank @Size(min = 2, max = 120) String name) {}

    public record BudgetDto(UUID costCenterId, String yearMonth, String amount, String consumed, String available) {}

    public record SetBudgetInput(@NotBlank @Pattern(regexp = "^\\d{1,13}(\\.\\d{1,2})?$", message = "deve ser um valor como 50000.00") String amount) {}
}
