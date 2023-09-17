import { Component} from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-month',
  templateUrl: '../month/month.component.html',
  styleUrls: ['../../app.component.css','../month/month.component.css']
})
export class MonthComponent {
  public isPopupOpen: boolean = false;

  constructor(private router: Router) { }
  
  addExpanse() {
    this.isPopupOpen = !this.isPopupOpen;
    this.router.navigate(['/addexpanse'])
  }
}
