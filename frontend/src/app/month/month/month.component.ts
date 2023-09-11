import { Component} from '@angular/core';

@Component({
  selector: 'app-month',
  templateUrl: '../month/month.component.html',
  styleUrls: ['../../app.component.css','../month/month.component.css']
})
export class MonthComponent {
  public isPopupOpen: boolean = false;
  togglePopup() {
    this.isPopupOpen = !this.isPopupOpen;
  }
}
