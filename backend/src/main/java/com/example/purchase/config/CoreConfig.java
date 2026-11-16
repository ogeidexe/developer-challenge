package com.example.purchase.config;

import com.example.purchase.domain.BusinessCalendar;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

import java.time.Clock;

@Configuration
@EnableScheduling
public class CoreConfig {

    /** Single time source — tests can replace it with a fixed clock. */
    @Bean
    Clock clock() {
        return Clock.systemUTC();
    }

    @Bean
    BusinessCalendar businessCalendar(Clock clock) {
        return new BusinessCalendar(clock);
    }
}
