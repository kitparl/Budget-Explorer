package com.budgetExplorer.app.service;

import com.budgetExplorer.app.dto.MonthDTO;
import com.budgetExplorer.app.dto.Output;
import com.budgetExplorer.app.exception.AllTimeException;
import com.budgetExplorer.app.exception.MonthException;
import com.budgetExplorer.app.model.MonthlyExpanse;

import java.util.List;

public interface MonthService {
    Output saveMonthlyExpanse(MonthlyExpanse monthlyExpanse, String month, Integer year) throws MonthException;

    List<MonthlyExpanse> getMonthlyExpanseList(String month, Integer year) throws MonthException;

    Output deleteAllMonthlyOtherExpanseItem(String id) throws MonthException;

    Output updateMonthlyExpanse(String id, String month, Integer year, Integer oldInvestmentAmount, Integer oldTotalExpanseThisMonth, Integer oldSavingAmount, MonthlyExpanse monthlyExpanse) throws MonthException, AllTimeException;

    MonthlyExpanse getExpanseItemByMonth(String monthCode) throws MonthException;

    MonthDTO getTotalMonthExpanseData(String month, Integer year) throws MonthException;

    Output deleteMonthExpanseItemById(String id, String month, Integer year) throws MonthException;
}