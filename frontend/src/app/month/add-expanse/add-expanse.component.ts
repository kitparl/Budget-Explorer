import { Component, Input, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { SharedDataService } from 'src/services/shared-data.service';
import { StorageBrowser } from '../../../storage/storage.browser';

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
  public dataSource = new BehaviorSubject<any>(null);

  
  constructor(private router: Router, private sharedDataService: SharedDataService, private formBuilder: FormBuilder, private storageBrowser: StorageBrowser) { 
    this.form1 = this.formBuilder.group({
      budget: new FormControl(),
      investment: new FormControl(),
      saving: new FormControl()
    });
    this.form2 = this.formBuilder.group({
      expanse: new FormControl(''),
      amount: new FormControl(''),

    });
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
  }


  onSubmit(event: Event) {
    // Submit the form data to the server
    const formName = (event.target as HTMLFormElement).name;

    if (formName === 'setBasics') {

      const formValues = this.form1.value;
      console.log('[ 1 ] >', formValues);



    } else if (formName === 'otherExpanse') {
    }
  }

}
