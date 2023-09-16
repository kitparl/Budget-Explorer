package com.budgetExplorer.app.service.serviceImpl;

import com.budgetExplorer.app.dao.YearDao;
import com.budgetExplorer.app.dto.Output;
import com.budgetExplorer.app.exception.MonthException;
import com.budgetExplorer.app.exception.YearException;
import com.budgetExplorer.app.model.YearlyExpanse;
import com.budgetExplorer.app.service.YearService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.Optional;

@Service
public class YearServiceImpl implements YearService {

    @Autowired
    public YearDao yearDao;

    @Override
    public YearlyExpanse getYearExpanseData(Integer year) throws YearException {
        Optional<YearlyExpanse> opt = yearDao.findById(year);
        if (!opt.isPresent()) {
            throw new YearException("This Year Expanse Not Found");
        } else {
            YearlyExpanse expanse = opt.get();
            return expanse;
        }
    }

    @Override
    public Output saveYearExpanse(YearlyExpanse yearExpanse) throws MonthException {
        yearDao.save(yearExpanse);

        Output output = new Output();
        output.setTimestamp(LocalDateTime.now());
        output.setMessage("Year Save Successfully");

        return output;
    }
}
