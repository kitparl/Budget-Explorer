package com.budgetExplorer.app.dao;

import com.budgetExplorer.app.model.YearlyExpanse;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface YearDao extends MongoRepository<YearlyExpanse, Integer> {
}
