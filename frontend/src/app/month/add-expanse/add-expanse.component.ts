import { Component, Input, OnInit } from '@angular/core';
import { AbstractControl, FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { SharedDataService } from 'src/services/shared-data.service';
import { StorageBrowser } from '../../../storage/storage.browser';
import { ToastrService } from 'ngx-toastr';
import { BudgetCalculate } from '../../../utilites/budgetCalculate';
import { MonthExpanses } from '../../../models/MonthExpanses';


@Component({
  selector: 'app-add-expanse',
  templateUrl: './add-expanse.component.html',
  styleUrls: ['./add-expanse.component.css', '../../app.component.css'],
})
export class AddExpanseComponent implements OnInit {
  monthData: any;
  isHomeComponent = false;
  form1: FormGroup;
  form2: FormGroup;
  public dataSource = new BehaviorSubject<any>(null);
  otherExpensesItems: any[];

  constructor(private router: Router, private sharedDataService: SharedDataService, private formBuilder: FormBuilder, private storageBrowser: StorageBrowser, private toastrService: ToastrService, private budgetCalculate: BudgetCalculate) {
    this.form1 = this.formBuilder.group({
      budget: ['', [Validators.required, Validators.pattern(/^[1-9]\d*$/)]],
      investment: ['', [Validators.required, Validators.pattern(/^[1-9]\d*$/)]],
      saving: ['', [Validators.required, Validators.pattern(/^[1-9]\d*$/)]],
    }, { validator: this.savingAndInvestmentValidator });

    this.form2 = this.formBuilder.group({
      expanse: new FormControl(''),
      amount: new FormControl(''),

    });
    this.otherExpensesItems = this.storageBrowser.get("otherExpensesItems") || [];
    console.log('[ constructir otherExpensesItems ] >', this.otherExpensesItems);
  }

  savingAndInvestmentValidator(control: AbstractControl) {
    const budgetControl = control.get('budget');
    const investmentControl = control.get('investment');
    const savingControl = control.get('saving');

    if (budgetControl && investmentControl) {
      const budget = budgetControl.value;
      const investment = investmentControl.value;

      if (budget != null && investment != null) {
        if (investment > budget * 0.3) {
          investmentControl.setErrors({ investmentExceedsBudget: true });
        } else {
          investmentControl.setErrors(null);
        }
      }
    }

    if (budgetControl && savingControl) {
      const budget = budgetControl.value;
      const saving = savingControl.value;

      if (budget != null && saving != null) {
        if (saving > budget * 0.5) {
          savingControl.setErrors({ savingExceedsBudget: true });
        } else {
          savingControl.setErrors(null);
        }
      }
    }

    return null;
  }



  goHome() {
    this.isHomeComponent = !this.isHomeComponent;
    this.router.navigate(['month'])
    const storedPopupState = sessionStorage.clear();

  }

  ngOnInit(): void {
    // Subscribe to dataEmitter in SharedDataService
    this.sharedDataService.dataEmitter.subscribe((data) => {
      this.storageBrowser.set('monthData', data);
    });
    sessionStorage.setItem('isPopupOpen', JSON.stringify(true));
    let ans = this.storageBrowser.get('monthData');
    console.log('[ ans ] >', ans);
    this.monthData = ans;
  }


  onSubmit(event: Event) {
    // Submit the form data to the server

    const formName = (event.target as HTMLFormElement).name;
    if (formName === 'setBasics') {
      const formValues = this.form1.value;
      let savedMonthData: MonthExpanses = {
        id: this.monthData.id,
        year: this.monthData.year,
        month: this.monthData.month,
        budget: formValues.budget,
        investmentAmount: formValues.investment,
        savingAmount: formValues.saving,
        totalExpanseThisMonth: formValues.budget - (formValues.investment + formValues.saving),
        // otherExpanse: []
      }
      this.monthData = savedMonthData;
      this.storageBrowser.set("newMonthData", formValues)
      console.log('[ formValues ] >', formValues);

      this.budgetCalculate.calCulateMainBudget(formValues, this.monthData);
    } else if (formName === 'otherExpanse') {
      const formValues = this.form2.value;
      console.log('[ formValues ] >', formValues);
      // this.budgetCalculate.calculateOtherExpense(this.form2.value);

      console.log("typeof this.otherExpensesItems:", typeof this.otherExpensesItems);
      console.log("this.otherExpensesItems:", this.otherExpensesItems);
      this.otherExpensesItems.push(formValues);
      console.log("After push, this.otherExpensesItems:", this.otherExpensesItems);

      this.storageBrowser.set(
        "otherExpensesItems",
        JSON.stringify(
          this.otherExpensesItems
        ))
    }
  }

}

