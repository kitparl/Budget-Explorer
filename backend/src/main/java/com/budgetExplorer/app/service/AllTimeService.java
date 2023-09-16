package com.budgetExplorer.app.service;

import com.budgetExplorer.app.dto.Output;
import com.budgetExplorer.app.exception.AllTimeException;
import com.budgetExplorer.app.exception.MonthException;
import com.budgetExplorer.app.model.AllTimeExpanse;
import com.budgetExplorer.app.model.YearlyExpanse;

public interface AllTimeService {
    AllTimeExpanse getAllTimeExpanseData() throws AllTimeException;
    Output saveAllTimeExpanse(AllTimeExpanse allTimeExpanse) throws MonthException;

}
