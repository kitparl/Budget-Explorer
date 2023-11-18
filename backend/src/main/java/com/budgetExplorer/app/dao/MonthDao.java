package com.budgetExplorer.app.dao;

import com.budgetExplorer.app.model.MonthlyExpanse;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;


@Repository
public interface MonthDao extends MongoRepository<MonthlyExpanse, String> {
    List<MonthlyExpanse> findByYear(Integer year);
    MonthlyExpanse findByYearAndMonth(Integer year, String month);
}
