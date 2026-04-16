import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {

  isDark = signal(true);

  constructor() {
    const savedTheme = localStorage.getItem('theme');

    if (savedTheme === 'dark') {
      this.enableDark();
    }
  }

  toggleTheme() {
    this.isDark() ? this.disableDark() : this.enableDark();
  }

  private enableDark() {
    document.documentElement.classList.add('dark');
    localStorage.setItem('theme', 'dark');
    this.isDark.set(true);
  }

  private disableDark() {
    document.documentElement.classList.remove('dark');
    localStorage.setItem('theme', 'light');
    this.isDark.set(false);
  }
}