package com.budgetExplorer.app;

import com.budgetExplorer.app.enums.Month;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class BackendApplication {

	public static void main(String[] args) {
		Month c = Month.APRIL;
		System.out.println(c);
		SpringApplication.run(BackendApplication.class, args);
	}

}
