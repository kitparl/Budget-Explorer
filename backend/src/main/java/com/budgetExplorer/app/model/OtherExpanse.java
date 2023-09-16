package com.budgetExplorer.app.model;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@AllArgsConstructor
@NoArgsConstructor
@Getter
@Setter
public class OtherExpanse {
    private Integer id;
    private String expanseType;
    private Integer amount ;
}
