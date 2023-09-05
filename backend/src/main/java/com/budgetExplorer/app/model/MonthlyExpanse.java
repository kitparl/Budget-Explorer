package com.budgetExplorer.app.model;

import com.budgetExplorer.app.enums.Month;
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
@Document("monthExpanses")
public class MonthlyExpanse {
    @Id
    private Integer mid;
    private Year year;

    private Month month;

    private Integer budget;

    private Integer investmentAmount;

    private Integer savingAmount;

    private Integer totalExpanseThisMonth;

     private OtherExpanse otherExpanse;

}
