import { Routes } from '@angular/router';
import { AuthGuard } from './core/guards/auth-guard';
import { MainLayoutComponent } from './core/layout/main-layout/main-layout';

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
    path: 'tenant-landing',
    loadComponent: () => import('./features/tenant/tenant-landingpage/tenant-landingpage')
      .then(m => m.TenantLandingpageComponent)
  },
  {
    path: 'tenant-property',
    loadComponent: () => import('./features/tenant/tenant-property-details/tenant-property-details')
      .then(m => m.TenantPropertyDetailsComponent)
  },
  {
    path: 'tenant-property/:id',
    loadComponent: () => import('./features/tenant/tenant-property-details/tenant-property-details')
      .then(m => m.TenantPropertyDetailsComponent)
  },
  {
    path: 'tenant-profile',
    canActivate: [AuthGuard],
    loadComponent: () => import('./features/tenant/tenant-profile/tenant-profile')
      .then(m => m.TenantProfileComponent)
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

  // === ADMIN ROUTES ===
  {
    path: 'admin',
    component: MainLayoutComponent,
    canActivate: [AuthGuard],
    data: { role: 'admin' },
    children: [
      {
        path: '',
        loadComponent: () => import('./features/admin/dashboard/admin-dashboard')
          .then(m => m.AdminDashboard)
      },
      {
        path: 'users',
        loadComponent: () => import('./features/admin/manage-users/landlord-list/landlord-list')
          .then(m => m.LandlordListComponent)
      },
      {
        path: 'users/:id',
        loadComponent: () => import('./features/admin/manage-users/landlord-detail/landlord-detail')
          .then(m => m.LandlordDetailComponent)
      },
      {
        path: 'properties',
        loadComponent: () => import('./features/admin/check-properties/check-properties')
          .then(m => m.CheckPropertiesComponent)
      },
      {
        path: 'landlords/pending',
        redirectTo: 'users',
        pathMatch: 'full'
      },
      {
        path: 'landlords/:id',
        redirectTo: 'users/:id'
      }
    ]
  },

  // === LANDLORD ROUTES ===
  {
    path: 'landlord',
    component: MainLayoutComponent,
    canActivate: [AuthGuard],
    data: { role: 'landlord' },
    children: [
      {
        path: '',
        loadComponent: () => import('./features/landlord/dashboard/landlord-dashboard')
          .then(m => m.LandlordDashboardComponent)
      },
      {
        path: 'properties',
        loadComponent: () => import('./features/landlord/properties/landlord-properties')
          .then(m => m.LandlordPropertiesComponent)
      },
      {
        path: 'applications',
        loadComponent: () => import('./features/landlord/applications/landlord-applications')
          .then(m => m.LandlordApplications)
      },
      {
        path: 'billing',
        loadComponent: () => import('./features/landlord/billing/landlord-billing')
          .then(m => m.LandlordBillingComponent)
      },
      {
        path: 'rentals',
        loadComponent: () => import('./features/landlord/rentals/landlord-rentals')
          .then(m => m.LandlordRentalsComponent)
      }
    ]
  },

  // === TENANT ROUTES ===
  {
    path: 'tenant',
    canActivate: [AuthGuard],
    loadComponent: () => import('./features/tenant/dashboard/tenant-dashboard')
      .then(m => m.TenantDashboard)
  },

  { path: '**', redirectTo: 'landing' }
];