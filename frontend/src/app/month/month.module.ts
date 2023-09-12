import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {FormsModule, ReactiveFormsModule} from '@angular/forms';
import {RouterModule} from '@angular/router';
import { MonthsRoute } from './month.routing';
import { MonthComponent } from './month/month.component';
import { AddExpanseComponent } from './add-expanse/add-expanse.component'
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import {MatIconModule} from '@angular/material/icon';
import {MatDividerModule} from '@angular/material/divider';
import {MatButtonModule} from '@angular/material/button';

@NgModule({
  imports: [
    CommonModule,
RouterModule.forChild(MonthsRoute),
    FormsModule,
    ReactiveFormsModule,
    NgbTooltipModule,
    MatButtonModule, 
    MatDividerModule, 
    MatIconModule
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