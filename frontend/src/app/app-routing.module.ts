import { HomeResolver } from 'src/resolvers/HomeResolver';
import { AddExpanseComponent } from './month/add-expanse/add-expanse.component';
import { MonthComponent } from './month/month/month.component';
// app-routing.module.ts
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

export const routes: Routes = [
  // Define a route for the new component
  { path: '', redirectTo: '/month', pathMatch: 'full' },,
  {path: 'month', 
  component: MonthComponent,
  // pathMatch: 'full',
  resolve: {
    homeResolver: HomeResolver
  },
},
{ path: 'month/:param1/:param2', component: AddExpanseComponent },
// children: [
//   { path: 'addexpanse', 
//   component: AddExpanseComponent   
// },
// ]},
// {
//   path: '**',
//   redirectTo: '/',
//   pathMatch: 'full'
// },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
  providers: []
})
export class AppRoutingModule { }
