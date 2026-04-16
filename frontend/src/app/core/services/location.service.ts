import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class LocationService {

  baseUrl = 'https://psgc.gitlab.io/api';

  constructor(private http: HttpClient) {}

  getProvinces() {
    return this.http.get<any[]>(`${this.baseUrl}/provinces`);
  }

  getMunicipalities(provinceCode: string) {
    return this.http.get<any[]>(`${this.baseUrl}/provinces/${provinceCode}/municipalities`);
  }

  getCities(provinceCode: string) {
    return this.http.get<any[]>(`${this.baseUrl}/provinces/${provinceCode}/cities`);
  }

  getBarangaysMunicipality(code: string) {
    return this.http.get<any[]>(`${this.baseUrl}/municipalities/${code}/barangays`);
  }

}