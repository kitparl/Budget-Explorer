package com.budgetExplorer.app.service;

import com.budgetExplorer.app.dto.Output;
import com.budgetExplorer.app.exception.MonthException;
import com.budgetExplorer.app.exception.YearException;
import com.budgetExplorer.app.model.MonthlyExpanse;
import com.budgetExplorer.app.model.YearlyExpanse;

public interface YearService {
    YearlyExpanse getYearExpanseData(Integer year) throws YearException;
    Output saveYearExpanse(YearlyExpanse yearExpanse) throws MonthException;
}
