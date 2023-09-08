package com.budgetExplorer.app.model;

import lombok.*;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Year;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@ToString
@Document(collection ="yearlyExpanses")
public class YearlyExpanse {
    @Id
    private Year year;
    private MonthlyExpanse monthlyExpanseThisYear;
    private Integer totalAmount;
    private Integer totalInvestmentThisYear;
    private Integer totalSavingThisYear;
}
