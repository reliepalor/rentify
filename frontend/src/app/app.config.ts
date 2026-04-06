import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { HashLocationStrategy, LocationStrategy } from '@angular/common';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    
    // This line fixes the 404 issue on Vercel
    { provide: LocationStrategy, useClass: HashLocationStrategy }
  ]
};