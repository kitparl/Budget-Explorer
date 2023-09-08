package com.budgetExplorer.app.service;

import com.budgetExplorer.app.dto.MonthDTO;
import com.budgetExplorer.app.dto.Output;
import com.budgetExplorer.app.exception.MonthException;
import com.budgetExplorer.app.model.MonthlyExpanse;

import java.util.List;

public interface MonthService {
    public Output saveMonthlyExpanse(MonthlyExpanse monthlyExpanse) throws MonthException;
    public List<MonthlyExpanse> getMonthlyExpanseList() throws MonthException;
    public Output deleteAllMonthlyExpanse() throws MonthException;
    public Output updateMonthlyExpanse(Integer id) throws MonthException;
    public MonthDTO getTotalMonthExpanseData() throws MonthException;
//    public Output deleteMonthExpanseById(Integer id, String monthYear) throws MonthException;
}