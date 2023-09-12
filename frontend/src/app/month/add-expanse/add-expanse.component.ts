import { Component } from '@angular/core';

@Component({
  selector: 'app-add-expanse',
  templateUrl: './add-expanse.component.html',
  styleUrls: ['./add-expanse.component.css','../../app.component.css'],
})
export class AddExpanseComponent {
  isHomeComponent = false;

  goHome() {
    this.isHomeComponent = !this.isHomeComponent;
  }
}
