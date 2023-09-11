import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AddExpanseComponent } from './add-expanse.component';

describe('AddExpanseComponent', () => {
  let component: AddExpanseComponent;
  let fixture: ComponentFixture<AddExpanseComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [AddExpanseComponent]
    });
    fixture = TestBed.createComponent(AddExpanseComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
