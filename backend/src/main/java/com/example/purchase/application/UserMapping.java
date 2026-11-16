package com.example.purchase.application;

import com.example.purchase.api.dto.AdminDtos.CostCenterDto;
import com.example.purchase.api.dto.AdminDtos.UserDto;
import com.example.purchase.persistence.CostCenterEntity;
import com.example.purchase.persistence.UserEntity;

/** The only way a user leaves the server: there is no field for the password hash (README §2.1). */
final class UserMapping {

    private UserMapping() {}

    static UserDto toDto(UserEntity u) {
        return new UserDto(u.getId(), u.getEmail(), u.getName(), u.getRole(), u.getApproverLevel(),
                u.getCostCenterId(), u.isActive(), u.getCreatedAt(), u.getLockVersion());
    }

    static CostCenterDto toDto(CostCenterEntity c) {
        return new CostCenterDto(c.getId(), c.getCode(), c.getName(), c.isActive());
    }
}
