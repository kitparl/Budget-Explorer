import { DataService } from './../../../services/data.service';
import { Component, OnInit, ViewChild} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { MonthExpanses } from 'src/models/MonthExpanses';
import { AddExpanseComponent } from '../add-expanse/add-expanse.component';
import { SharedDataService } from 'src/services/shared-data.service';

@Component({
  selector: 'app-month',
  templateUrl: '../month/month.component.html',
  styleUrls: ['../../app.component.css','../month/month.component.css']
})
export class MonthComponent implements OnInit{
  // @ViewChild(AddExpanseComponent) addExpanseComponent: AddExpanseComponent;
  public isPopupOpen: boolean = false;
  public monthData: any;

  constructor(private router: Router, private route: ActivatedRoute, private dataservice: DataService, private sharedDataService: SharedDataService) {
  }
  
  addExpanse(month: {}) {
    // this.addExpanseComponent.receivedData = month;
    this.isPopupOpen = !this.isPopupOpen;
    this.sharedDataService.sendData(month);

    sessionStorage.setItem('isPopupOpen', JSON.stringify(this.isPopupOpen));
    this.router.navigate(['/month', month['month'], month['year']])
  }

  ngOnInit(): void {
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    
    console.log(typeof currentYear.toString()); // This will log the current year to the console
    this.dataservice.getAllMonthListByYear(currentYear.toString()).subscribe((data: {}) => {
      this.monthData = data;
      this.allMonthDataDisplayInCard(data)
      console.log('[ this.monthData ] >', this.monthData)
    })

    // const storedPopupState = sessionStorage.getItem('isPopupOpen');
    // if (storedPopupState) {
    //   this.isPopupOpen = JSON.parse(storedPopupState);
    // }
    // const storedPopupState = sessionStorage.clear();
  
    
  }
  allMonthDataDisplayInCard(data: any){
    console.log(data)
    this.getObjectByMonth(data);
  }

   getObjectByMonth(month: string) {
    try{
      return this.monthData.find((obj) => obj.month == month);
    }catch(e){}
  }
}

