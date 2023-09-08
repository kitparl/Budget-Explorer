package com.budgetExplorer.app.service.serviceImpl;

import com.budgetExplorer.app.dao.MonthDao;
import com.budgetExplorer.app.dto.MonthDTO;
import com.budgetExplorer.app.dto.Output;
import com.budgetExplorer.app.enums.Month;
import com.budgetExplorer.app.exception.GlobalException;
import com.budgetExplorer.app.exception.MonthException;
import com.budgetExplorer.app.model.MonthlyExpanse;
import com.budgetExplorer.app.service.MonthService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Service
public class MonthServiceImpl implements MonthService {

    @Autowired
    private MonthDao monthDao;
    @Override
    public Output saveMonthlyExpanse(MonthlyExpanse monthlyExpanse) throws MonthException {

        Optional<MonthlyExpanse> opt = monthDao.findById(monthlyExpanse.getId());
        if(opt.isPresent())
            throw  new MonthException("This Month Expanse already exists");
        else
            monthDao.save(monthlyExpanse);

            Output output = new Output();
            output.setTimestamp(LocalDateTime.now());
            output.setMessage("Expanse Save Successfully");

            return output;
    }



    @Override
    public List<MonthlyExpanse> getMonthlyExpanseList() throws MonthException {
        List<MonthlyExpanse> list = monthDao.findAll();

        if (list.isEmpty())
            throw new MonthException("No Monthly Expanse found");

        return list;
    }

    @Override
    public Output deleteAllMonthlyExpanse() throws MonthException {

        return null;
    }

    @Override
    public Output updateMonthlyExpanse(Integer id) throws MonthException {
        return null;
    }

    @Override
    public MonthDTO getTotalMonthExpanseData() throws MonthException {
        return null;
    }

//    @Override
//    public Output deleteMonthExpanseById(Integer id, String monthYear) throws MonthException {
//        //monthYear = "05-2022";
//        if(!monthYear.contains("-")){
//            throw new MonthException("Wrong month Year Passed");
//        }
////        List<String> month = monthYear.split("-");
//        MonthlyExpanse monthlyExpanse = monthDao.getByIdAndMonthAndYear(id, monthYear.split("-")[0], monthYear.split("-")[1]);
//        Output output = new Output();
//
//        if (monthlyExpanse != null) {
//
////            MonthlyExpanse monthlyExpanse = opt.get();
//
//            monthDao.delete(monthlyExpanse);
//
//            output.setMessage("Expanse Deleted Successfully");
//            output.setTimestamp(LocalDateTime.now());
//
//            return output;
//
//        } else {
//            throw new MonthException("Exception does not exist");
//        }
//    }
}
