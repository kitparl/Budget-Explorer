package com.budgetExplorer.app.dao;
import com.budgetExplorer.app.model.MonthlyExpanse;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface MonthDao extends MongoRepository<MonthlyExpanse, Integer> {
//    @Query("{ '_id' : ?0, 'month' : ?1, 'year' : ?2 }")
//    MonthlyExpanse getByIdAndMonthAndYear(Integer id, String month, String year);
}
