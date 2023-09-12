package com.budgetExplorer.app.service.serviceImpl;

import com.budgetExplorer.app.dao.MonthDao;
import com.budgetExplorer.app.dto.MonthDTO;
import com.budgetExplorer.app.dto.Output;
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
    public Output saveMonthlyExpanse(MonthlyExpanse monthlyExpanse, String month, String year) throws MonthException {

        Optional<MonthlyExpanse> opt = monthDao.findById(monthlyExpanse.getId());
        if(opt.isPresent())
            throw  new MonthException("This Month Expanse already exists");
        else
            monthlyExpanse.setMonthCode(month+year);
        monthDao.save(monthlyExpanse);

            Output output = new Output();
            output.setTimestamp(LocalDateTime.now());
            output.setMessage("Expanse Save Successfully");

            return output;
    }



    @Override
    public List<MonthlyExpanse> getMonthlyExpanseList(String month, String year) throws MonthException {
        List<MonthlyExpanse> list = monthDao.findAll();

        if (list.isEmpty())
            throw new MonthException("No Monthly Expanse found");

        return list;
    }

    @Override
    public Output deleteAllMonthlyExpanseItem(String month, String year) throws MonthException {

        List<MonthlyExpanse> list = monthDao.findByMonthCode(month + year);
        Output output = new Output();

        if (list.isEmpty()) {
            throw new MonthException("No Expanses found");
        } else {
            monthDao.deleteAll(list);

            output.setMessage("Expanse Deleted Successfully");
            output.setTimestamp(LocalDateTime.now());
        }

        return output;
    }

    @Override
    public Output updateMonthlyExpanse(Integer id, String month, String year, MonthlyExpanse monthlyExpanse) throws MonthException {

        Optional<MonthlyExpanse> opt = monthDao.findByIdAndMonthCode(id,month+year);

        if (opt == null) {
            throw new MonthException("No Expanse Found");
        } else {
            MonthlyExpanse expanse = opt.get();

            if (expanse.getBudget() != null) {
                expanse.setBudget(monthlyExpanse.getBudget());
            }
            if(expanse.getInvestmentAmount() != null){
                expanse.setInvestmentAmount(monthlyExpanse.getInvestmentAmount());
            }
            if(expanse.getSavingAmount() != null){
                expanse.setSavingAmount(monthlyExpanse.getSavingAmount());
            }

            if(expanse.getOtherExpanse() != null) {
                expanse.getOtherExpanse().forEach(e -> {
                    monthlyExpanse.getOtherExpanse().forEach(f -> {
                        if(e.getId() ==  f.getId()){
                            if(e.getAmount() != null){
                                e.setAmount(f.getAmount());
                            }
                            if(e.getExpanseType() != null){
                                e.setExpanseType(f.getExpanseType());
                            }
                        }
                    });
                });
                expanse.setSavingAmount(expanse.getSavingAmount());
            }
            monthDao.save(expanse);
            }

            Output output = new Output();
            output.setMessage("Update Successfully");
            output.setTimestamp(LocalDateTime.now());

            return output;
        }

    @Override
    public List<MonthlyExpanse> getExpanseItemByMonth(String monthCode) throws MonthException {
        List<MonthlyExpanse> monthlyExpanses = monthDao.findByMonthCode(monthCode);

        if (monthlyExpanses.isEmpty()) {
            throw new MonthException("No MonthlyExpanses found");
        }

        return monthlyExpanses;
    }


    @Override
    public MonthDTO getTotalMonthExpanseData(String month, String year) throws MonthException {
        return null;
    }

    @Override
    public Output deleteMonthExpanseItemById(Integer id, String month, String year) throws MonthException {

        Optional<MonthlyExpanse> opt = monthDao.findByIdAndMonthCode(id,month+year);
        Output output = new Output();

        if (opt != null) {

            MonthlyExpanse monthlyExpanse = opt.get();

            monthDao.delete(monthlyExpanse);

            output.setMessage("Expanse Deleted Successfully");
            output.setTimestamp(LocalDateTime.now());

            return output;

        } else {
            throw new MonthException("Exception does not exist");
        }
    }
}
