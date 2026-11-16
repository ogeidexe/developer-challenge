package com.example.purchase;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class PurchaseRequestsApplication {

    public static void main(String[] args) {
        SpringApplication.run(PurchaseRequestsApplication.class, args);
    }
}
