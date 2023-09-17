package com.budgetExplorer.app.controller;

import com.budgetExplorer.app.dto.MonthDTO;
import com.budgetExplorer.app.dto.Output;
import com.budgetExplorer.app.exception.AllTimeException;
import com.budgetExplorer.app.exception.MonthException;
import com.budgetExplorer.app.model.MonthlyExpanse;
import com.budgetExplorer.app.service.MonthService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/month")
public class MonthController {

    @Autowired
    private MonthService monthService;

    //create monthly expanse
    @PostMapping("/saveExpanse")
    public ResponseEntity<Output> createMonthlyExpanseHandler(@RequestHeader("YEAR") String yearHeader, @RequestHeader("MONTH") String monthHeader, @RequestBody MonthlyExpanse monthlyExpanse) throws MonthException {
        Output output = monthService.saveMonthlyExpanse(monthlyExpanse, monthHeader, Integer.valueOf(yearHeader));
        return new ResponseEntity<>(output, HttpStatus.CREATED);
    }

    //get All monthly Expanse

    @GetMapping("/getExpanse/{id}")
    public ResponseEntity<MonthlyExpanse> getMonthlyExpanseByMonthCodeHandler(@PathVariable String id) throws MonthException {
        MonthlyExpanse monthlyExpanse = monthService.getExpanseItemByMonth(id);
        return new ResponseEntity<>(monthlyExpanse, HttpStatus.OK);
    }

    //delete All Monthly Expanse
    @DeleteMapping("/allOther/delete/{id}")
    public ResponseEntity<Output> deleteAllMonthlyExpanseHandler(@PathVariable String id) throws MonthException {
        Output output = monthService.deleteAllMonthlyOtherExpanseItem(id);
        return new ResponseEntity<>(output, HttpStatus.ACCEPTED);
    }

    //update Monthly Expanse
    @PutMapping("/editExpanse/{id}")
    public ResponseEntity<Output> updateMonthlyExpanseHandler(@RequestHeader("YEAR") String yearHeader, @RequestHeader("MONTH") String monthHeader, @RequestHeader("OLD-INVESTMENT-AMOUNT") Integer oldInvestmentAmount, @RequestHeader("OLD-TOTAL-EXPANSE-THIS-MONTH") Integer oldTotalExpanseThisMonth, @RequestHeader("OLD-SAVING-AMOUNT") Integer oldSavingAmount, @PathVariable("id") String id, @RequestBody MonthlyExpanse monthlyExpanse) throws MonthException, AllTimeException {
        Output output = monthService.updateMonthlyExpanse(id, monthHeader, Integer.valueOf(yearHeader), oldInvestmentAmount, oldTotalExpanseThisMonth, oldSavingAmount, monthlyExpanse);
        return new ResponseEntity<>(output, HttpStatus.ACCEPTED);
    }

    //    get Total Month ExpanseData Card
    @GetMapping("/totalExpanse")
    public ResponseEntity<MonthDTO> getTotalMonthExpanseHandler(@RequestHeader("YEAR") String yearHeader, @RequestHeader("MONTH") String monthHeader) throws MonthException {
        MonthDTO monthlyExpanse = monthService.getTotalMonthExpanseData(monthHeader, Integer.valueOf(yearHeader));
        return new ResponseEntity<>(monthlyExpanse, HttpStatus.OK);
    }

    //    delete Month Expanse By Id
    @DeleteMapping(value = "/delete/{id}")
    public ResponseEntity<Output> deleteMonthExpanseByIdHandler(@PathVariable("id") String id, @RequestHeader("YEAR") String yearHeader, @RequestHeader("MONTH") String monthHeader) throws MonthException {
        Output output = monthService.deleteMonthExpanseItemById(id, monthHeader, Integer.valueOf(yearHeader));
        return new ResponseEntity<>(output, HttpStatus.ACCEPTED);
    }

    //all data month expanse list
    @GetMapping("/all/{year}")
    public ResponseEntity<List<MonthlyExpanse>> allMonthExpanseListIdHandler(@PathVariable String year) throws MonthException {
        List<MonthlyExpanse> list = monthService.getAllMonthListByYear(Integer.valueOf(year));
        return new ResponseEntity<>(list, HttpStatus.OK);
    }
}