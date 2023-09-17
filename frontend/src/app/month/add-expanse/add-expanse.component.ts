import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-add-expanse',
  templateUrl: './add-expanse.component.html',
  styleUrls: ['./add-expanse.component.css','../../app.component.css'],
})
export class AddExpanseComponent {
  isHomeComponent = false;
  
  constructor(private router: Router) { }


  goHome() {
    this.isHomeComponent = !this.isHomeComponent;
    // this.router.navigate([''])
    
  }
}
