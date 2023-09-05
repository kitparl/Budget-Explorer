package com.budgetExplorer.app.model;


import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Document("allTimeExpanses")
public class AllTimeExpanse {
    @Id
    private Integer id;
    private YearlyExpanse yearlyExpanse;
    private MonthlyExpanse monthlyExpanse;
    private Integer totalExpanseTillNow;
    private Integer totalInvestmentThisYear;
    private Integer totalSavingThisYear;

}
