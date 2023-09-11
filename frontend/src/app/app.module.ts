import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppComponent } from './app.component';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { YearComponent } from './year/year.component';
import { OverallComponent } from './overall/overall.component';
import { NavbarComponent } from './shared/navbar/navbar.component';
import { FooterComponent } from './shared/footer/footer.component';
import { MonthModule } from './month/month.module';

@NgModule({
  declarations: [
    AppComponent,
    YearComponent,
    OverallComponent,
    NavbarComponent,
    FooterComponent,
    
  ],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    MonthModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
