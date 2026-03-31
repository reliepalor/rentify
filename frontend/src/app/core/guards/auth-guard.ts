import { Injectable } from '@angular/core';
import { CanActivate, Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { SupabaseService } from '../services/supabase.service';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {

  constructor(
    private supabaseService: SupabaseService,
    private router: Router
  ) {}

  async canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Promise<boolean> {
    
    const user = await this.supabaseService.getCurrentUser();

    if (!user) {
      // Not logged in → redirect to login
      this.router.navigate(['/login']);
      return false;
    }

    // Get user profile with role
    const profile = await this.supabaseService.getCurrentProfile();

    if (!profile || !profile.role) {
      this.router.navigate(['/login']);
      return false;
    }

    const userRole = profile.role;
    const targetPath = state.url;

    // Role-based routing logic
    if (targetPath.startsWith('/admin') && userRole !== 'admin') {
      this.router.navigate(['/login']);
      return false;
    }

    if (targetPath.startsWith('/landlord') && userRole !== 'landlord') {
      this.router.navigate(['/login']);
      return false;
    }

    if (targetPath.startsWith('/tenant') && userRole !== 'tenant') {
      this.router.navigate(['/login']);
      return false;
    }

    return true;
  }
}