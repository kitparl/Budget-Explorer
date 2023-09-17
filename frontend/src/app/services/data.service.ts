import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class DataService {
  private apiUrl = 'https://budget-explorer.onrender.com/api';

  constructor(private http: HttpClient) { }

  saveExpanse(monthHeader: string, yearHeader: string, data: any): Observable<any> {
    const headers = new HttpHeaders()
      .set('YEAR', yearHeader)
      .set('MONTH', monthHeader);
    return this.http.post(`${this.apiUrl}/month/saveExpanse`, data, { headers });
  };

  getExpanseById(id: number): Observable<any> {
    const url = `${this.apiUrl}/month/getExpanse/${id}`;
    return this.http.get(url);
  }

  getExpanseByYear(yearHeader: string): Observable<any> {
    const url = `/api/year/getExpanse`;
    const headers = new HttpHeaders()
      .set('YEAR', yearHeader)
    return this.http.get(url, { headers });
  }

  deleteExpanseById(id: number): Observable<any> {
    const url = `/api/allOther/delete/${id}`;
    return this.http.delete(url);
  }

  updateExpanseById(id: number, yearHeader: string, monthHeader: string, updatedData: any): Observable<any> {
    const url = `/api/editExpanse/${id}`;
    const headers = new HttpHeaders()
      .set('YEAR', yearHeader)
      .set('MONTH', monthHeader);
    return this.http.put(url, updatedData, { headers });
  }

  deleteExpanseByMonthId(id: number, monthHeader: string, yearHeader: string): Observable<any> {
    const url = `/api/delete/${id}`;
    const headers = new HttpHeaders()
      .set('YEAR', yearHeader)
      .set('MONTH', monthHeader);
    return this.http.delete(url, { headers });
  }

  getAllTimeExpanse(): Observable<any> {
    const url = '/api/allTime/getExpanse';
    return this.http.get(url);
  }

  saveExpanseForYear(expanseData: any): Observable<any> {
    const url = `/api/year/saveExpanse`;
    return this.http.post(url, expanseData);
  }

  saveExpanseForAllTime(expanseData: any): Observable<any> {
    const url = `/api/allTime/saveExpanse`;
    return this.http.post(url, expanseData);
  }
}