import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../environment/environment'

@Injectable({
  providedIn: 'root'
})
export class DataService {

  constructor(private http: HttpClient) { }

  saveExpanse(monthHeader: string, yearHeader: string, data: any): Observable<any> {
    const headers = new HttpHeaders()
      .set('YEAR', yearHeader)
      .set('MONTH', monthHeader);
    return this.http.post(`${environment.api_url}/month/saveExpanse`, data, { headers });
  };

  getExpanseById(id: number): Observable<any> {
    const url = `${environment.api_url}/month/getExpanse/${id}`;
    return this.http.get(url);
  }

  getExpanseByYear(year: string): Observable<any> {
    const url = `${environment.api_url}/year/getExpanse/${year}`;
    return this.http.get(url);
  }

  deleteExpanseById(id: number): Observable<any> {
    const url = `${environment.api_url}/allOther/delete/${id}`;
    return this.http.delete(url);
  }

  updateExpanseById(id: number, yearHeader: string, monthHeader: string, updatedData: any): Observable<any> {
    const url = `${environment.api_url}/editExpanse/${id}`;
    const headers = new HttpHeaders()
      .set('YEAR', yearHeader)
      .set('MONTH', monthHeader);
    return this.http.put(url, updatedData, { headers });
  }

  deleteExpanseByMonthId(id: number, monthHeader: string, yearHeader: string): Observable<any> {
    const url = `${environment.api_url}/delete/${id}`;
    const headers = new HttpHeaders()
      .set('YEAR', yearHeader)
      .set('MONTH', monthHeader);
    return this.http.delete(url, { headers });
  }

  getAllTimeExpanse(): Observable<any> {
    const url = `${environment.api_url}/allTime/getExpanse`;
    return this.http.get(url);
  }

  saveExpanseForYear(expanseData: any): Observable<any> {
    const url = `${environment.api_url}/year/saveExpanse`;
    return this.http.post(url, expanseData);
  }

  saveExpanseForAllTime(expanseData: any): Observable<any> {
    const url = `${environment.api_url}/allTime/saveExpanse`;
    return this.http.post(url, expanseData);
  }

  getAllMonthListByYear(year: string): Observable<any> {
    return this.http.get(`${environment.api_url}/month/all/${year}`);
  }
}