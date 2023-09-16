package com.budgetExplorer.app.controller;

import com.budgetExplorer.app.dto.Output;
import com.budgetExplorer.app.exception.AllTimeException;
import com.budgetExplorer.app.exception.MonthException;
import com.budgetExplorer.app.model.AllTimeExpanse;
import com.budgetExplorer.app.service.AllTimeService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;


@RestController
@RequestMapping("/api/allTime")
public class AllTimeController {
    @Autowired
    private AllTimeService allTimeService;

    @GetMapping("/getExpanse")
    public ResponseEntity<AllTimeExpanse> getTotalMonthExpanseHandler() throws AllTimeException {
        AllTimeExpanse allTimeExpanse = allTimeService.getAllTimeExpanseData();
        return new ResponseEntity<>(allTimeExpanse, HttpStatus.OK);
    }

    @PostMapping("/saveExpanse")
    public ResponseEntity<Output> createYearlyExpanseHandler(@RequestBody AllTimeExpanse allTimeExpanse) throws MonthException {
        Output output = allTimeService.saveAllTimeExpanse(allTimeExpanse);
        return new ResponseEntity<>(output, HttpStatus.CREATED);
    }
}