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
            monthlyExpanse.setMonthCode(month + year);
            if (monthlyExpanse.getBudget() != null) {
                Optional<YearlyExpanse> yearOpt = yearDao.findById(Integer.valueOf(year));
                Optional<AllTimeExpanse> allTimeOpt = allTimeDao.findById(allTimeExpanseId);
                if (!yearOpt.isPresent() || !allTimeOpt.isPresent()) {

                } else {
                    MonthlyExpanse expanse = opt.get();
                    YearlyExpanse yearlyExpanse = yearOpt.get();
                    AllTimeExpanse allTimeExpanse = allTimeOpt.get();
                    setZeroDefaultMonthModelField(expanse);
                    setZeroDefaultYearModelField(yearlyExpanse);
                    setZeroDefaultAllTimeModelField(allTimeExpanse);

                    if (monthlyExpanse.getSavingAmount() != null) {
                        Integer totalAddYearAmount = yearlyExpanse.getTotalSavingThisYear() + monthlyExpanse.getSavingAmount();
                        yearlyExpanse.setTotalSavingThisYear(totalAddYearAmount);

                        Integer totalAddAllTimeAmount = allTimeExpanse.getTotalSavingTillNow() + monthlyExpanse.getSavingAmount();
                        allTimeExpanse.setTotalSavingTillNow(totalAddAllTimeAmount);
                    }
                    if (monthlyExpanse.getInvestmentAmount() != null) {
                        Integer totalAddYearAmount = yearlyExpanse.getTotalInvestmentThisYear() + monthlyExpanse.getInvestmentAmount();
                        yearlyExpanse.setTotalInvestmentThisYear(totalAddYearAmount);

                        Integer totalAddAllTimeAmount = allTimeExpanse.getTotalInvestmentTillNow() + monthlyExpanse.getInvestmentAmount();
                        allTimeExpanse.setTotalInvestmentTillNow(totalAddAllTimeAmount);
                    }
                    if (monthlyExpanse.getBudget() != null) {
                        Integer totalAddYearAmount = yearlyExpanse.getTotalBudget() + monthlyExpanse.getBudget();
                        yearlyExpanse.setTotalBudget(totalAddYearAmount);

                        Integer totalAddAllTimeAmount = allTimeExpanse.getTotalBudgetTillNow() + monthlyExpanse.getBudget();
                        allTimeExpanse.setTotalBudgetTillNow(totalAddAllTimeAmount);
                    }
                    if (monthlyExpanse.getTotalExpanseThisMonth() != null) {
                        Integer totalAddYearAmount = yearlyExpanse.getTotalExpanse() + monthlyExpanse.getTotalExpanseThisMonth();
                        yearlyExpanse.setTotalBudget(totalAddYearAmount);

                        Integer totalAddAllTimeAmount = allTimeExpanse.getTotalExpanseTillNow() + monthlyExpanse.getTotalExpanseThisMonth();
                        allTimeExpanse.setTotalExpanseTillNow(totalAddAllTimeAmount);
                    }
                    allTimeDao.save(allTimeExpanse);
                    yearDao.save(yearlyExpanse);
                }
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
    public Output deleteAllMonthlyExpanseItem(String month, Integer year) throws MonthException {

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
    public Output updateMonthlyExpanse(Integer id, String month, Integer year, Integer oldInvestmentAmount, Integer oldTotalExpanseThisMonth, Integer oldSavingAmount, MonthlyExpanse monthlyExpanse) throws MonthException, AllTimeException {

        Optional<MonthlyExpanse> monthlyExpanseOpt = monthDao.findByIdAndMonthCode(id, month + Integer.toString(year));
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
    public List<MonthlyExpanse> getExpanseItemByMonth(String monthCode) throws MonthException {
        List<MonthlyExpanse> monthlyExpanses = monthDao.findByMonthCode(monthCode);

        if (monthlyExpanses.isEmpty()) {
            throw new MonthException("No MonthlyExpanses found");
        }
        return monthlyExpanses;
    }


    @Override
    public MonthDTO getTotalMonthExpanseData(String month, Integer year) throws MonthException {
        return null;
    }

    @Override
    public Output deleteMonthExpanseItemById(Integer id, String month, Integer year) throws MonthException {

        Optional<MonthlyExpanse> opt = monthDao.findByIdAndMonthCode(id, month + year);
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
