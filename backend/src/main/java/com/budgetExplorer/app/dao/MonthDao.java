package com.budgetExplorer.app.dao;

import com.budgetExplorer.app.model.MonthlyExpanse;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;


@Repository
public interface MonthDao extends MongoRepository<MonthlyExpanse, String> {
}
