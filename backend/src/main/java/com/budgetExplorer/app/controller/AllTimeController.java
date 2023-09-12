package com.budgetExplorer.app.controller;

import com.budgetExplorer.app.exception.MonthException;
import com.budgetExplorer.app.model.MonthlyExpanse;
import com.budgetExplorer.app.service.MonthService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/all")
public class AllTimeController {

    @Autowired
    private MonthService monthService;

    @GetMapping("/getList")
    public ResponseEntity<List<MonthlyExpanse>> getMonthlyExpanseListHandler(@RequestHeader("YEAR") String yearHeader, @RequestHeader("MONTH") String monthHeader) throws MonthException {
        List<MonthlyExpanse> list = monthService.getMonthlyExpanseList(monthHeader, yearHeader);
        System.out.println(yearHeader);
        System.out.println(monthHeader);
        return new ResponseEntity<>(list, HttpStatus.OK);
    }
}
