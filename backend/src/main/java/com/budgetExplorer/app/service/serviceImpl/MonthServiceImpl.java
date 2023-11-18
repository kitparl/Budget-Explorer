package com.budgetExplorer.app.service.serviceImpl;

import com.budgetExplorer.app.dao.AllTimeDao;
import com.budgetExplorer.app.dao.MonthDao;
import com.budgetExplorer.app.dao.YearDao;
import com.budgetExplorer.app.dto.MonthDTO;
import com.budgetExplorer.app.dto.Output;
import com.budgetExplorer.app.exception.AllTimeException;
import com.budgetExplorer.app.exception.MonthException;
import com.budgetExplorer.app.model.AllTimeExpanse;
import com.budgetExplorer.app.model.MonthlyExpanse;
import com.budgetExplorer.app.model.OtherExpanse;
import com.budgetExplorer.app.model.YearlyExpanse;
import com.budgetExplorer.app.service.MonthService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Service
public class MonthServiceImpl implements MonthService {

    @Value("${AllTimeExpanseId}")
    private int allTimeExpanseId;
    @Autowired
    private MonthDao monthDao;

    @Autowired
    private AllTimeDao allTimeDao;

    @Autowired
    private YearDao yearDao;


    @Override
    public Output saveMonthlyExpanse(MonthlyExpanse monthlyExpanse, String month, Integer year) throws MonthException {

        Optional<MonthlyExpanse> opt = monthDao.findById(monthlyExpanse.getId());
        if (opt.isPresent()) {
            throw new MonthException("This Month Expanse already exists");
        } else {
            if (monthlyExpanse.getBudget() != null) {
                Optional<YearlyExpanse> yearOpt = yearDao.findById(Integer.valueOf(year));
                Optional<AllTimeExpanse> allTimeOpt = allTimeDao.findById(allTimeExpanseId);
                if (!yearOpt.isPresent()) {
                    YearlyExpanse yearlyExpanse = new YearlyExpanse(year, 0, 0, 0, 0);
                    yearDao.save(yearlyExpanse);
                }
                if (!allTimeOpt.isPresent()) {
                    AllTimeExpanse allTimeExpanse = new AllTimeExpanse(allTimeExpanseId, 0, 0, 0, 0);
                    allTimeDao.save(allTimeExpanse);
                }

                    YearlyExpanse yearlyExpanse = yearOpt.get();
                    AllTimeExpanse allTimeExpanse = allTimeOpt.get();
                    setZeroDefaultYearModelField(yearlyExpanse);
                    setZeroDefaultAllTimeModelField(allTimeExpanse);

                    if (monthlyExpanse.getSavingAmount() != null) {
                        Integer totalAddYearAmount = yearlyExpanse.getTotalSavingThisYear() + monthlyExpanse.getSavingAmount();
                        yearlyExpanse.setTotalSavingThisYear(totalAddYearAmount);
                        System.out.println("totalAddYearAmount" + totalAddYearAmount);

                        Integer totalAddAllTimeAmount = allTimeExpanse.getTotalSavingTillNow() + monthlyExpanse.getSavingAmount();
                        allTimeExpanse.setTotalSavingTillNow(totalAddAllTimeAmount);
                        System.out.println("totalAddAllTimeAmount" + totalAddAllTimeAmount);
                    }
                    if (monthlyExpanse.getInvestmentAmount() != null) {
                        Integer totalAddYearAmount = yearlyExpanse.getTotalInvestmentThisYear() + monthlyExpanse.getInvestmentAmount();
                        yearlyExpanse.setTotalInvestmentThisYear(totalAddYearAmount);
                        System.out.println("totalAddYearAmount" + totalAddYearAmount);

                        Integer totalAddAllTimeAmount = allTimeExpanse.getTotalInvestmentTillNow() + monthlyExpanse.getInvestmentAmount();
                        allTimeExpanse.setTotalInvestmentTillNow(totalAddAllTimeAmount);
                        System.out.println("totalAddAllTimeAmount" + totalAddAllTimeAmount);
                    }
                    if (monthlyExpanse.getBudget() != null) {
                        Integer totalAddYearAmount = yearlyExpanse.getTotalBudget() + monthlyExpanse.getBudget();
                        yearlyExpanse.setTotalBudget(totalAddYearAmount);
                        System.out.println("totalAddYearAmount" + totalAddYearAmount);

                        Integer totalAddAllTimeAmount = allTimeExpanse.getTotalBudgetTillNow() + monthlyExpanse.getBudget();
                        allTimeExpanse.setTotalBudgetTillNow(totalAddAllTimeAmount);
                        System.out.println("totalAddAllTimeAmount" + totalAddAllTimeAmount);
                    }
                    if (monthlyExpanse.getTotalExpanseThisMonth() != null) {
                        Integer totalAddYearAmount = yearlyExpanse.getTotalExpanse() + monthlyExpanse.getTotalExpanseThisMonth();
                        yearlyExpanse.setTotalExpanse(totalAddYearAmount);
                        System.out.println("totalAddYearAmount" + totalAddYearAmount);

                        Integer totalAddAllTimeAmount = allTimeExpanse.getTotalExpanseTillNow() + monthlyExpanse.getTotalExpanseThisMonth();
                        allTimeExpanse.setTotalExpanseTillNow(totalAddAllTimeAmount);
                        System.out.println("totalAddAllTimeAmount" + totalAddAllTimeAmount);
                    }
                    allTimeDao.save(allTimeExpanse);
                    yearDao.save(yearlyExpanse);
                }
            }

        monthDao.save(monthlyExpanse);

        Output output = new Output();
        output.setTimestamp(LocalDateTime.now());
        output.setMessage("Expanse Save Successfully");

        return output;
    }

    @Override
    public List<MonthlyExpanse> getMonthlyExpanseList(String month, Integer year) throws MonthException {
        List<MonthlyExpanse> list = monthDao.findAll();

        if (list.isEmpty())
            throw new MonthException("No Monthly Expanse found");

        return list;
    }

    @Override
    public Output deleteAllMonthlyOtherExpanseItem(String id) throws MonthException {

        Optional<MonthlyExpanse> opt = monthDao.findById(id);
        if (!opt.isPresent()) {

        } else {
            opt.get().setOtherExpanse(null);
        }

        Output output = new Output();
        output.setTimestamp(LocalDateTime.now());
        output.setMessage("Deleted Successfully");

        return output;
    }

    @Override
    public Output updateMonthlyExpanse(String id, String month, Integer year, Integer oldInvestmentAmount, Integer oldTotalExpanseThisMonth, Integer oldSavingAmount, MonthlyExpanse monthlyExpanse) throws MonthException, AllTimeException {

        Optional<MonthlyExpanse> monthlyExpanseOpt = monthDao.findById(id);
        Optional<YearlyExpanse> yearlyExpanseOpt = yearDao.findById(year);
        Optional<AllTimeExpanse> allTimeExpanseOpt = allTimeDao.findById(allTimeExpanseId);


        if (monthlyExpanseOpt == null) {
            throw new MonthException("No Expanse Found");
        } else {

            if (allTimeExpanseOpt == null || yearlyExpanseOpt == null) {
                throw new AllTimeException("Something Went Wrong");
            } else {
                MonthlyExpanse expanse = monthlyExpanseOpt.get();
                YearlyExpanse yearlyExpanse = yearlyExpanseOpt.get();
                AllTimeExpanse allTimeExpanse = allTimeExpanseOpt.get();

                setZeroDefaultMonthModelField(expanse);
                setZeroDefaultYearModelField(yearlyExpanse);
                setZeroDefaultAllTimeModelField(allTimeExpanse);

                if (monthlyExpanse.getBudget() != null) {
                    expanse.setBudget(monthlyExpanse.getBudget());

                    Integer totalAddYearAmount = yearlyExpanse.getTotalBudget() + monthlyExpanse.getBudget() - (oldInvestmentAmount + oldTotalExpanseThisMonth + oldSavingAmount);
                    yearlyExpanse.setTotalBudget(totalAddYearAmount);
                    System.out.print("year invemstment : ");
                    System.out.print(totalAddYearAmount);
                    System.out.println();

                    Integer totalAddAllTimeAmount = allTimeExpanse.getTotalBudgetTillNow() + monthlyExpanse.getBudget() - (oldInvestmentAmount + oldTotalExpanseThisMonth + oldSavingAmount);
                    allTimeExpanse.setTotalBudgetTillNow(totalAddAllTimeAmount);
                    System.out.print("all invesment : ");
                    System.out.print(totalAddAllTimeAmount);
                    System.out.println();
                }
                if (monthlyExpanse.getInvestmentAmount() != null) {
                    expanse.setInvestmentAmount(monthlyExpanse.getInvestmentAmount());

                    Integer totalAddYearAmount = yearlyExpanse.getTotalInvestmentThisYear() + monthlyExpanse.getInvestmentAmount() - oldInvestmentAmount;
                    System.out.print("year invemstment : ");
                    System.out.print(totalAddYearAmount);
                    System.out.println();
                    yearlyExpanse.setTotalInvestmentThisYear(totalAddYearAmount);

                    Integer totalAddAllTimeAmount = allTimeExpanse.getTotalInvestmentTillNow() + monthlyExpanse.getInvestmentAmount();
                    System.out.print("all invesment : ");
                    System.out.print(totalAddAllTimeAmount);
                    System.out.println();
                    allTimeExpanse.setTotalInvestmentTillNow(totalAddAllTimeAmount);
                }
                if (monthlyExpanse.getSavingAmount() != null) {
                    expanse.setSavingAmount(monthlyExpanse.getSavingAmount());

                    Integer totalAddYearAmount = yearlyExpanse.getTotalSavingThisYear() + monthlyExpanse.getSavingAmount() - oldSavingAmount;
                    yearlyExpanse.setTotalSavingThisYear(totalAddYearAmount);
                    System.out.print("year saving : ");
                    System.out.print(totalAddYearAmount);
                    System.out.println();

                    Integer totalAddAllTimeAmount = allTimeExpanse.getTotalSavingTillNow() + monthlyExpanse.getSavingAmount() - oldSavingAmount;
                    allTimeExpanse.setTotalSavingTillNow(totalAddAllTimeAmount);
                    System.out.print("all saving : ");
                    System.out.print(totalAddAllTimeAmount);
                    System.out.println();
                }

                if (monthlyExpanse.getTotalExpanseThisMonth() != null) {
                    expanse.setTotalExpanseThisMonth(monthlyExpanse.getTotalExpanseThisMonth());
                    Integer totalAddYearAmount = yearlyExpanse.getTotalExpanse() + monthlyExpanse.getTotalExpanseThisMonth() - oldTotalExpanseThisMonth;
                    yearlyExpanse.setTotalExpanse(totalAddYearAmount);
                    System.out.print("year expanse : ");
                    System.out.print(totalAddYearAmount);
                    System.out.println();

                    Integer totalAddAllTimeAmount = allTimeExpanse.getTotalExpanseTillNow() + monthlyExpanse.getTotalExpanseThisMonth() - oldTotalExpanseThisMonth;
                    allTimeExpanse.setTotalExpanseTillNow(totalAddAllTimeAmount);
                    System.out.print("all expanse : ");
                    System.out.print(totalAddAllTimeAmount);
                    System.out.println();
                }
                if (monthlyExpanse.getOtherExpanse() != null) {
                    if (expanse.getOtherExpanse() != null) {
                        expanse.getOtherExpanse().forEach(e -> {
                            monthlyExpanse.getOtherExpanse().forEach(f -> {
                                if (e.getId() == f.getId()) {
                                    if (e.getAmount() != null) {
                                        e.setAmount(f.getAmount());
                                    }
                                    if (e.getExpanseType() != null) {
                                        e.setExpanseType(f.getExpanseType());
                                    }
                                }
                            });
                        });
                        expanse.setSavingAmount(expanse.getSavingAmount());
                    }
                }
                allTimeDao.save(allTimeExpanse);
                yearDao.save(yearlyExpanse);
                monthDao.save(expanse);
            }

            Output output = new Output();
            output.setMessage("Update Successfully");
            output.setTimestamp(LocalDateTime.now());

            return output;
        }
    }


    @Override
    public MonthlyExpanse getExpanseItemByMonth(String id) throws MonthException {
        Optional<MonthlyExpanse> opt = monthDao.findById(id);

        if (!opt.isPresent()) {
            throw new MonthException("Empty Data");
        }
        return opt.get();
    }


    @Override
    public MonthDTO getTotalMonthExpanseData(String month, Integer year) throws MonthException {
        return null;
    }

    @Override
    public Output deleteMonthExpanseItemById(Integer id, String month, Integer year) throws MonthException {

        MonthlyExpanse monthlyExpanse = monthDao.findByYearAndMonth(year, month);
        Output output = new Output();

        if (monthlyExpanse != null) {

            List<OtherExpanse> otherExpanseList = monthlyExpanse.getOtherExpanse();
            otherExpanseList.removeIf(expense -> (expense.getId()).equals(id));
            monthlyExpanse.setOtherExpanse(otherExpanseList);
            monthDao.save(monthlyExpanse);
            output.setMessage("Expanse Deleted Successfully");
            output.setTimestamp(LocalDateTime.now());

            return output;

        } else {
            throw new MonthException("Item does not exist");
        }
    }

    @Override
    public List<MonthlyExpanse> getAllMonthListByYear(Integer year) throws MonthException {
        List<MonthlyExpanse> list = monthDao.findByYear(year);
        if(list.isEmpty()){
        throw new MonthException("No Month Data Found");
        }else{
            return list;
        }
    }

    private void setZeroDefaultMonthModelField(MonthlyExpanse expanse) {
        if (expanse.getBudget() == null) {
            expanse.setBudget(0);
        }
        if (expanse.getSavingAmount() == null) {
            expanse.setSavingAmount(0);
        }
        if (expanse.getInvestmentAmount() == null) {
            expanse.setInvestmentAmount(0);
        }
        if (expanse.getTotalExpanseThisMonth() == null) {
            expanse.setTotalExpanseThisMonth(0);
        }
    }

    private void setZeroDefaultYearModelField(YearlyExpanse expanse) {
        if (expanse.getTotalBudget() == null) {
            expanse.setTotalBudget(0);
        }
        if (expanse.getTotalExpanse() == null) {
            expanse.setTotalExpanse(0);
        }
        if (expanse.getTotalSavingThisYear() == null) {
            expanse.setTotalSavingThisYear(0);
        }
        if (expanse.getTotalInvestmentThisYear() == null) {
            expanse.setTotalInvestmentThisYear(0);
        }
    }

    private void setZeroDefaultAllTimeModelField(AllTimeExpanse expanse) {
        if (expanse.getTotalBudgetTillNow() == null) {
            expanse.setTotalBudgetTillNow(0);
        }
        if (expanse.getTotalExpanseTillNow() == null) {
            expanse.setTotalExpanseTillNow(0);
        }
        if (expanse.getTotalInvestmentTillNow() == null) {
            expanse.setTotalInvestmentTillNow(0);
        }
        if (expanse.getTotalSavingTillNow() == null) {
            expanse.setTotalSavingTillNow(0);
        }
    }
}
