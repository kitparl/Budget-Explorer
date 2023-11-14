import { Injectable } from '@angular/core';
import { ToastrService } from 'ngx-toastr';


@Injectable()
export class BudgetCalculate {

    constructor(private toastrService: ToastrService) { }

    calCulateMainBudget(values: any, existedMonthData: any) {
      let budget = values.budget;
      let investment = values.investment;
      let saving = values.saving;
      
      let otherExpense = budget - (investment + saving);
      
      if(budget !== investment + saving + otherExpense){
        this.toastrService.error('Expenses Data Not Matched', 'Error Log', {
            timeOut: 3000,
        })
        return null;
      }
  
      // check existed/not existed otherExpense 
      let existedOtherExpanse = 0;
      for (const expense of existedMonthData.otherExpanse) {
        existedOtherExpanse += expense.amount;
      }
      
      if(otherExpense < existedOtherExpanse){
        this.toastrService.error('Expenses Data Not Matched', 'Error Log', {
          timeOut: 3000,
        })
        return null;
      }
      
      console.log('[totalOtherExpanse] >', existedOtherExpanse);
      console.log('[existedMonthData.totalExpanseThisMonth] >', existedMonthData.totalExpanseThisMonth);
    }
  
    calculateOtherExpense(value: any): void {
      throw new Error("Function not implemented."); 
    }
  
  }