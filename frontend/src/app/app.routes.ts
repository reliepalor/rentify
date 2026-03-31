import { Routes } from '@angular/router';
import { AuthGuard } from './core/guards/auth-guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'landing',
    pathMatch: 'full'
  },
  {
    path: 'landing',
    loadComponent: () => import('./features/landing/landingpage')
      .then(m => m.LandingComponent)
  },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login')
      .then(m => m.LoginComponent)
  },
  {
    path: 'register',
    loadComponent: () => import('./features/auth/register/register')
      .then(m => m.RegisterComponent)
  },

  // Protected Routes with Auth Guard
  { 
    path: 'admin', 
    canActivate: [AuthGuard],
    loadComponent: () => import('./features/admin/dashboard/admin-dashboard')
      .then(m => m.AdminDashboard) 
  },
  { 
    path: 'landlord', 
    canActivate: [AuthGuard],
    loadComponent: () => import('./features/landlord/dashboard/landlord-dashboard')
      .then(m => m.LandlordDashboard) 
  },
  { 
    path: 'tenant', 
    canActivate: [AuthGuard],
    loadComponent: () => import('./features/tenant/dashboard/tenant-dashboard')
      .then(m => m.TenantDashboard) 
  },

  { path: '**', redirectTo: 'landing' }
];