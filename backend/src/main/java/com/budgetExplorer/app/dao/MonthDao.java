package com.budgetExplorer.app.dao;
import com.budgetExplorer.app.model.MonthlyExpanse;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface MonthDao extends MongoRepository<MonthlyExpanse, Integer> {

    List<MonthlyExpanse> findByMonthCode(String monthCode);


    Optional<MonthlyExpanse> findByIdAndMonthCode(Integer integer, String monthCode);
//    List<MonthlyExpanse> findByMonthCode(String monthCode);

}
