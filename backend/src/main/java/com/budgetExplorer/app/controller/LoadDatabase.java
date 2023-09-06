package com.budgetExplorer.app.controller;

import com.budgetExplorer.app.dao.AllTimeDao;
import com.budgetExplorer.app.model.AllTimeExpanse;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

//@Configuration
//public class LoadDatabase {
//    @Bean
//    public CommandLineRunner initDb(AllTimeDao repo) {
//        return args -> {
//            // Create an instance of AllTimeExpanse with some data
//            AllTimeExpanse allTimeExpanse = new AllTimeExpanse(1, null,null,null,null,null);
//
//            // Save the instance to the repository
//            allTimeExpanse = repo.save(allTimeExpanse);
//
//            // You can perform other database initialization tasks here if needed
//
//            // For example, printing the saved entity's details
//            System.out.println("Saved AllTimeExpanse: " + allTimeExpanse);
//
//            // You can delete the entity if that's your intention
//            // repo.delete(allTimeExpanse);
//        };
//    }
//}
