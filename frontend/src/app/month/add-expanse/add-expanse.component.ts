import { Component, Input, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup } from '@angular/forms';
import { Router } from '@angular/router';
import { SharedDataService } from 'src/services/shared-data.service';

@Component({
  selector: 'app-add-expanse',
  templateUrl: './add-expanse.component.html',
  styleUrls: ['./add-expanse.component.css','../../app.component.css'],
})
export class AddExpanseComponent implements OnInit{
  monthData: any;
  isHomeComponent = false;
  form1: FormGroup;
  form2: FormGroup;

  
  constructor(private router: Router, private sharedDataService: SharedDataService, private formBuilder: FormBuilder) { 
  }


  goHome() {
    this.isHomeComponent = !this.isHomeComponent;
    this.router.navigate(['month'])
    
  }

  ngOnInit(): void {
    this.form1 = this.formBuilder.group({
      budget: new FormControl(),
      investment: new FormControl(),
      saving: new FormControl()
    });
    this.form1 = this.formBuilder.group({
      expanse: new FormControl(''),
      amount: new FormControl('')
    });
    this.sharedDataService.dataEmitter.subscribe((data) => {
      this.monthData = data;
      console.log('[ add-componet-recived-month--data ] >', data);
    });
  }


  onSubmit(event: Event) {
    // Submit the form data to the server
    const formName = (event.target as HTMLFormElement).name;

    if (formName === 'setBasics') {

      const formValues = this.form1.value;
      console.log('[ 1 ] >', formValues)


    } else if (formName === 'otherExpanse') {
    }
  }

}
