package com.budgetExplorer.app.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.mongodb.core.MongoTemplate;

@RestController
public class ConnectionController {

    @Autowired
    private MongoTemplate mongoTemplate;

    @GetMapping("/chk")
    public String checkMongoDBConnection() {
        try {
            mongoTemplate.getDb().getName(); // This will test the connection
            return "MongoDB connection is established";
        } catch (Exception e) {
            return "MongoDB connection failed: " + e.getMessage();
        }
    }
}
