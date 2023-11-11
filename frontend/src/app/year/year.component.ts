import { Component } from '@angular/core';
import { DataService } from 'src/services/data.service';
import { SharedDataService } from 'src/services/shared-data.service';

@Component({
  selector: 'app-year',
  templateUrl: './year.component.html',
  styleUrls: ['../app.component.css','./year.component.css']
})
export class YearComponent {
  yearData: any;

  constructor(private dataservice: DataService, private sharedDataService: SharedDataService) {}

  ngOnInit(): void {

  this.dataservice.getExpanseByYear("2023").subscribe((data: {}) => {

    console.log('[ year ] >', data)
    // console.log('[ allTime. ] >', data.totalBudgetTillNow)
    this.yearData = data;
  })
}
}
