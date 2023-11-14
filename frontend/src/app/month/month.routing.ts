import { Routes } from '@angular/router';
import { MonthComponent } from './month/month.component';
import { AddExpanseComponent } from './add-expanse/add-expanse.component';
import { HomeResolver } from '../../../src/resolvers/HomeResolver';

export const MonthsRoute: Routes = [
  // Define a route for the new component
  {path: 'home', 
  component: MonthComponent,
  pathMatch: 'full',
  resolve: {
    homeResolver: HomeResolver
  },
children: [
  { path: 'addexpanse', 
  component: AddExpanseComponent
},
]},
// {
//   path: '**',
//   redirectTo: '/',
//   pathMatch: 'full'
// },
];
