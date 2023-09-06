package com.budgetExplorer.app;

import com.budgetExplorer.app.enums.Month;
import com.mongodb.*;
import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;
import com.mongodb.client.MongoDatabase;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.bson.Document;

@SpringBootApplication
public class BackendApplication {

	public static void main(String[] args) {
		Month c = Month.APRIL;
		System.out.println(c);
//		String connectionString = "mongodb+srv://pranshubisht:3dNscJyHGEeiANwf@budget-explorer.2ubpkie.mongodb.net/?retryWrites=true&w=majority";
//
//		ServerApi serverApi = ServerApi.builder()
//				.version(ServerApiVersion.V1)
//				.build();
//
//		MongoClientSettings settings = MongoClientSettings.builder()
//				.applyConnectionString(new ConnectionString(connectionString))
//				.serverApi(serverApi)
//				.build();
//
//		// Create a new client and connect to the server
//		try (MongoClient mongoClient = MongoClients.create(settings)) {
//			try {
//				// Send a ping to confirm a successful connection
//				MongoDatabase database = mongoClient.getDatabase("admin");
//				database.runCommand(new Document("ping", 1));
//				System.out.println("Pinged your deployment. You successfully connected to MongoDB!");
//			} catch (MongoException e) {
//				e.printStackTrace();
//			}
//		}
		SpringApplication.run(BackendApplication.class, args);
	}

}
