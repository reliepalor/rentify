import { ApplicationConfig } from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    // HashLocationStrategy enabled to fix Vercel 404 issue
    provideRouter(routes, withHashLocation())
  ]
};