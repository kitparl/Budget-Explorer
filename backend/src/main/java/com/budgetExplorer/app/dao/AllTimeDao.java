package com.budgetExplorer.app.dao;

import com.budgetExplorer.app.model.AllTimeExpanse;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface AllTimeDao extends MongoRepository<AllTimeExpanse, Integer> {
}
