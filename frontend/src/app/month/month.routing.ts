import {Routes} from '@angular/router';
import { MonthComponent } from './month/month.component';
import { AddExpanseComponent } from './add-expanse/add-expanse.component';

export const MonthsRoute: Routes = [
  {
    path: '',
    component: MonthComponent,
    children: [{
      path: 'addexpanse',
      component: AddExpanseComponent
    }]
  }
];
