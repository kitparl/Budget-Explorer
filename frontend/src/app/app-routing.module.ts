import { AddExpanseComponent } from './month/add-expanse/add-expanse.component';
import { MonthComponent } from './month/month/month.component';
// app-routing.module.ts
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  // Define a route for the new component
  { path: '', redirectTo: '/home', pathMatch: 'full' },
  {path: 'Home', component: MonthComponent},
  { path: 'addexpanse', component: AddExpanseComponent },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
