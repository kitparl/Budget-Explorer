import { Component } from '@angular/core';
import { DataService } from 'src/services/data.service';
import { SharedDataService } from 'src/services/shared-data.service';

@Component({
  selector: 'app-overall',
  templateUrl: './overall.component.html',
  styleUrls: ['../app.component.css','./overall.component.css']
})
export class OverallComponent {

  allData: any;

  constructor(private dataservice: DataService, private sharedDataService: SharedDataService) {
  }

  ngOnInit(): void {

  this.dataservice.getAllTimeExpanse().subscribe((data: {}) => {

    // console.log('[ all time ] >', data)
    // console.log('[ allTime. ] >', data.totalBudgetTillNow)
    this.allData = data;
  })
}
}
