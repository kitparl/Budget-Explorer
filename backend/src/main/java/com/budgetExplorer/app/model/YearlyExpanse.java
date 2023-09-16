package com.budgetExplorer.app.model;

import lombok.*;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@ToString
@Document(collection = "yearlyExpanses")
public class YearlyExpanse {
    @Id
    private Integer year;
    //    private MonthlyExpanse monthlyExpanseThisYear;
    private Integer totalBudget ;
    private Integer totalExpanse ;
    private Integer totalInvestmentThisYear ;
    private Integer totalSavingThisYear ;
}
