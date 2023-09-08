package com.budgetExplorer.app.controller;

import com.budgetExplorer.app.dto.MonthDTO;
import com.budgetExplorer.app.dto.Output;
import com.budgetExplorer.app.exception.MonthException;
import com.budgetExplorer.app.model.MonthlyExpanse;
import com.budgetExplorer.app.service.MonthService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;

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
    public ResponseEntity<Output> createMonthlyExpanseHandler(@RequestBody MonthlyExpanse monthlyExpanse) throws MonthException {
        Output output = monthService.saveMonthlyExpanse(monthlyExpanse);
        return new ResponseEntity<>(output, HttpStatus.CREATED);
    }

    //get All monthly Expanse
    @GetMapping("/get")
    public ResponseEntity<List<MonthlyExpanse>> getMonthlyExpanseListHandler() throws MonthException{
        List<MonthlyExpanse> list = monthService.getMonthlyExpanseList();
        return new ResponseEntity<>(list, HttpStatus.OK);
    }

    //delete All Monthly Expanse
    @DeleteMapping("/delete")
    public ResponseEntity<Output> deleteAllMonthlyExpanseHandler() throws MonthException{
        Output output = monthService.deleteAllMonthlyExpanse();
        return new ResponseEntity<>(output, HttpStatus.ACCEPTED);
    }

    //update Monthly Expanse

    @PutMapping("/editExpanse/{id}")
    public ResponseEntity<Output> updateMonthlyExpanseHandler(@PathVariable("id") Integer id) throws MonthException{
        Output output = monthService.updateMonthlyExpanse(id);
        return new ResponseEntity<>(output, HttpStatus.ACCEPTED);
    }

//    get Total Month ExpanseData Card
    @GetMapping("/totalExpanseThisMonth")
    public ResponseEntity<MonthDTO> getTotalMonthExpanseHandler() throws MonthException{
        MonthDTO monthlyExpanse = monthService.getTotalMonthExpanseData();
        return new ResponseEntity<>(monthlyExpanse, HttpStatus.OK);
    }

//    deleteMonthExpanseById
//    @DeleteMapping(value = "{/delete/{monthYear}/{id}")
//    public ResponseEntity<Output> deleteMonthExpanseByIdHandler(@PathVariable("id") Integer id,
//                                                                @PathVariable("monthYear") String monthYear) throws MonthException{
//        Output output = monthService.deleteMonthExpanseById(id, monthYear);
//        return new ResponseEntity<>(output, HttpStatus.ACCEPTED);
//    }
}
