package com.budgetExplorer.app.model;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Year;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Document("yearlyExpanses")
public class YearlyExpanse {
    @Id
    private Year year;
    private MonthlyExpanse monthlyExpanseThisYear;
    private Integer totalAmount;
    private Integer totalInvestmentThisYear;
    private Integer totalSavingThisYear;
}
