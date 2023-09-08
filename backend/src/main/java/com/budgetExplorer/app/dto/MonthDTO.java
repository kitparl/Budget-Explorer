package com.budgetExplorer.app.dto;

import com.budgetExplorer.app.enums.Month;
import lombok.*;


@AllArgsConstructor
@NoArgsConstructor
@Getter
@Setter
@ToString
public class MonthDTO {
    private Integer totalExpanseThisMonth;
    private Month month;
    private String year;
    private Integer budget;
}
