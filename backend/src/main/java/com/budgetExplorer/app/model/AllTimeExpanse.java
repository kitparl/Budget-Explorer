package com.budgetExplorer.app.model;


import lombok.*;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@ToString
@Document(collection = "allTimeExpanses")
public class AllTimeExpanse {
    @Id
    private Integer id;
    //    private YearlyExpanse yearlyExpanse;
    //    private MonthlyExpanse monthlyExpanse;
    private Integer totalBudgetTillNow;
    private Integer totalExpanseTillNow;
    private Integer totalInvestmentTillNow;
    private Integer totalSavingTillNow;
}
