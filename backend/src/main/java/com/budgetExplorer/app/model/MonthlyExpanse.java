package com.budgetExplorer.app.model;

import lombok.*;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.util.List;

@Getter
@Setter
@AllArgsConstructor
@NoArgsConstructor
@ToString
@Document(collection = "monthExpanses")
public class MonthlyExpanse {
    @Id
    private String id;
    private Integer year;
    private String month;
    private Integer budget;
    private Integer investmentAmount;
    private Integer savingAmount;
    private Integer totalExpanseThisMonth;
    private String monthCode;
    private List<OtherExpanse> otherExpanse;

}
