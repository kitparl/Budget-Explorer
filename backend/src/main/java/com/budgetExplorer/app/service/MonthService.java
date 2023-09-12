package com.budgetExplorer.app.service;

import com.budgetExplorer.app.dto.MonthDTO;
import com.budgetExplorer.app.dto.Output;
import com.budgetExplorer.app.exception.MonthException;
import com.budgetExplorer.app.model.MonthlyExpanse;

import java.util.List;

public interface MonthService {
    Output saveMonthlyExpanse(MonthlyExpanse monthlyExpanse, String month, String year) throws MonthException;
    List<MonthlyExpanse> getMonthlyExpanseList(String month, String year) throws MonthException;

    Output deleteAllMonthlyExpanseItem(String month, String year) throws MonthException;
    Output updateMonthlyExpanse(Integer id, String month, String year, MonthlyExpanse monthlyExpanse) throws MonthException;
    List<MonthlyExpanse> getExpanseItemByMonth(String monthCode) throws MonthException;
    MonthDTO getTotalMonthExpanseData(String month, String year) throws MonthException;
    Output deleteMonthExpanseItemById(Integer id, String month, String year) throws MonthException;
}