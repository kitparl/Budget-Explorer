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

import java.time.LocalDateTime;

@RestController
@RequestMapping("/api/month")
public class MonthController {

    @Autowired
    private MonthService monthService;

    //test controller
    @GetMapping("/test")
    public ResponseEntity<Output> testHandler() {
        Output output = new Output();
        output.setMessage("Test");
        output.setTimestamp(LocalDateTime.now());
        return new ResponseEntity<>(output, HttpStatus.OK);
    }

    //create monthly expanse
    @PostMapping("/saveExpanse")
    public ResponseEntity<Output> createMonthlyExpanseHandler(@RequestHeader("YEAR") Integer yearHeader, @RequestHeader("MONTH") String monthHeader, @RequestBody MonthlyExpanse monthlyExpanse) throws MonthException {
        Output output = monthService.saveMonthlyExpanse(monthlyExpanse, monthHeader, yearHeader);
        return new ResponseEntity<>(output, HttpStatus.CREATED);
    }

    //get All monthly Expanse
    // get month list


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
    public ResponseEntity<Output> updateMonthlyExpanseHandler(@RequestHeader("YEAR") Integer yearHeader, @RequestHeader("MONTH") String monthHeader, @RequestHeader("OLD-INVESTMENT-AMOUNT") Integer oldInvestmentAmount, @RequestHeader("OLD-TOTAL-EXPANSE-THIS-MONTH") Integer oldTotalExpanseThisMonth, @RequestHeader("OLD-SAVING-AMOUNT") Integer oldSavingAmount, @PathVariable("id") String id, @RequestBody MonthlyExpanse monthlyExpanse) throws MonthException, AllTimeException {
        Output output = monthService.updateMonthlyExpanse(id, monthHeader, yearHeader, oldInvestmentAmount, oldTotalExpanseThisMonth, oldSavingAmount, monthlyExpanse);
        return new ResponseEntity<>(output, HttpStatus.ACCEPTED);
    }

    //    get Total Month ExpanseData Card
    @GetMapping("/totalExpanse")
    public ResponseEntity<MonthDTO> getTotalMonthExpanseHandler(@RequestHeader("YEAR") Integer yearHeader, @RequestHeader("MONTH") String monthHeader) throws MonthException {
        MonthDTO monthlyExpanse = monthService.getTotalMonthExpanseData(monthHeader, yearHeader);
        return new ResponseEntity<>(monthlyExpanse, HttpStatus.OK);
    }

    //    deleteMonthExpanseById
    @DeleteMapping(value = "/delete/{id}")
    public ResponseEntity<Output> deleteMonthExpanseByIdHandler(@PathVariable("id") String id, @RequestHeader("YEAR") Integer yearHeader, @RequestHeader("MONTH") String monthHeader) throws MonthException {
        Output output = monthService.deleteMonthExpanseItemById(id, monthHeader, yearHeader);
        return new ResponseEntity<>(output, HttpStatus.ACCEPTED);
    }
}
