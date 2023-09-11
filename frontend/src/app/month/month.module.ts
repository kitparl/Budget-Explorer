import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {FormsModule, ReactiveFormsModule} from '@angular/forms';
import {RouterModule} from '@angular/router';
import { MonthsRoute } from './month.routing';
import { MonthComponent } from './month/month.component';
import { AddExpanseComponent } from './add-expanse/add-expanse.component'
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

@NgModule({
  imports: [
    CommonModule,
RouterModule.forChild(MonthsRoute),
    FormsModule,
    ReactiveFormsModule,
  ],
  declarations: [
    MonthComponent,
    AddExpanseComponent
  ],
  exports: [
    MonthComponent,
    AddExpanseComponent
  ],
  providers: [],
})
export class MonthModule {
}
