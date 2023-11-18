package com.budgetExplorer.app.service.serviceImpl;

import org.springframework.scheduling.annotation.Scheduled;

public class CronjobService {
    @Scheduled(cron = "0 0/5 * * * ?") // Execute every 5 minutes
    public void myScheduledMethod() {
        // Your scheduled task logic goes here

        System.out.println("Executing my scheduled method...");
    }
}
