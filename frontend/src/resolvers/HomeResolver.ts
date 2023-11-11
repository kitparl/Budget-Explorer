// import { Injectable } from '@angular/core';
// import { Resolve, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
// import { Observable, catchError, map, tap } from 'rxjs';
// import { DataService } from '../services/data.service'; // Replace with your data service

// @Injectable({
//   providedIn: 'root'
// })
// export class HomeResolver implements Resolve<any> {
//   constructor(private dataService: DataService) {}

// resolve(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<any> {
//   console.log('Resolver is called');
//   let res =  this.dataService.getAllMonthListByYear("2023")
//   .pipe(
//     tap(data => console.log('Resolved data:', data)),
//     catchError(error => {
//       console.error('Error:', error);
//       throw error;
//     })
//     );
//     return res;
// }

// resolve(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<any> {
//   console.log('Resolver is called');
//   return this.dataService.getAllMonthListByYear("2023")
//     .pipe(
//       tap(data => console.log('Resolved data:', data)),
//       catchError(error => {
//         console.error('Error:', error);
//         throw error;
//       })
//     );
// }


//   resolve(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<any> {
//      let res  =  this.dataService.getAllMonthListByYear("2023")
//       .pipe(
//         map(data => ({ allMonthExpanse: data })),
//         catchError(error => {
//           console.error('Error:', error);
//           throw error;
//         })
//       );
//       console.log(res)
//   return res;
//   }


// Latest version

// import { UsersListService } from './../service/users-list.service';
import { DataService } from '../services/data.service'; // Replace with your data service

import {
  ActivatedRouteSnapshot,
  ResolveFn,
  RouterStateSnapshot,
} from '@angular/router';
import { inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

export const HomeResolver: ResolveFn<any> = (
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot,
  dataService: DataService = inject(DataService)
): Observable<{}> =>
dataService.getAllMonthListByYear("2023").pipe(
    catchError((err) => {
      return of('No data' + err);
    })
  );
