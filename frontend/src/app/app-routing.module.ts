import { AddExpanseComponent } from './month/add-expanse/add-expanse.component';
// app-routing.module.ts
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  // Define a route for the new component
  { path: 'addexpanse', component: AddExpanseComponent },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
