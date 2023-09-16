package com.budgetExplorer.app.controller;

import com.budgetExplorer.app.dto.Output;
import com.budgetExplorer.app.exception.MonthException;
import com.budgetExplorer.app.exception.YearException;
import com.budgetExplorer.app.model.MonthlyExpanse;
import com.budgetExplorer.app.model.YearlyExpanse;
import com.budgetExplorer.app.service.YearService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/year")
public class YearController {
    @Autowired
    private YearService yearService;
    @GetMapping("/getExpanse/{year}")
    public ResponseEntity<YearlyExpanse> getTotalYearlyExpanseHandler(@PathVariable Integer year) throws YearException {
        YearlyExpanse yearlyExpanse = yearService.getYearExpanseData(year);
        return new ResponseEntity<>(yearlyExpanse, HttpStatus.OK);
    }

    @PostMapping("/saveExpanse")
    public ResponseEntity<Output> createYearlyExpanseHandler(@RequestBody  YearlyExpanse yearlyExpanse) throws MonthException {
        Output output = yearService.saveYearExpanse(yearlyExpanse);
        return new ResponseEntity<>(output, HttpStatus.CREATED);
    }
}
