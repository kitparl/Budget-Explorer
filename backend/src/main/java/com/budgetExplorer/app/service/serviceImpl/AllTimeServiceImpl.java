package com.budgetExplorer.app.service.serviceImpl;

import com.budgetExplorer.app.dao.AllTimeDao;
import com.budgetExplorer.app.dto.Output;
import com.budgetExplorer.app.exception.AllTimeException;
import com.budgetExplorer.app.model.AllTimeExpanse;
import com.budgetExplorer.app.service.AllTimeService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.Optional;

@Service
public class AllTimeServiceImpl implements AllTimeService {

    @Value("${AllTimeExpanseId}")
    private int allTimeExpanseId;

    @Autowired
    public AllTimeDao allTimeDao;

    @Override
    public AllTimeExpanse getAllTimeExpanseData() throws AllTimeException {
        Optional<AllTimeExpanse> opt = allTimeDao.findById(allTimeExpanseId);

        if (opt.isPresent()) {
            return opt.get();
        } else {
            throw new AllTimeException("Something Went Wrong");
        }
    }

    @Override
    public Output saveAllTimeExpanse(AllTimeExpanse allTimeExpanse) {
        allTimeDao.save(allTimeExpanse);

        Output output = new Output();
        output.setTimestamp(LocalDateTime.now());
        output.setMessage("Year Save Successfully");

        return output;
    }

}
