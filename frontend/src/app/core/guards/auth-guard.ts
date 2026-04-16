import { Injectable } from '@angular/core';
import { CanActivate, Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { SupabaseService } from '../services/supabase.service';
import { LandlordService } from '../services/landlord.service';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {
  private readonly landlordReviewWaitKey = 'landlord_review_wait';

  constructor(
    private supabaseService: SupabaseService,
    private landlordService: LandlordService,
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

    if (targetPath.startsWith('/landlord')) {
      if (userRole !== 'landlord') {
        this.router.navigate(['/login']);
        return false;
      }

      const summary = await this.landlordService.getLandlordVerificationSummary(user.id);
      if (!summary || summary.status !== 'approved') {
        const message = summary?.status === 'rejected'
          ? 'Your landlord verification was rejected. Please check your email for the admin remarks and next steps.'
          : 'Thanks for signing up! Your landlord account is still under review. Please try logging in again once the admin approves your account.';

        sessionStorage.setItem(this.landlordReviewWaitKey, message);
        this.router.navigate(['/landing']);
        return false;
      }
    }

    if (targetPath.startsWith('/tenant') && userRole !== 'tenant') {
      this.router.navigate(['/login']);
      return false;
    }

    return true;
  }
}