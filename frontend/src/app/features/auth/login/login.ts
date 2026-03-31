import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { SupabaseService } from '../../../core/services/supabase.service';
import { ToastService } from '../../../shared/services/toast.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './login.html'  
})
export class LoginComponent implements OnInit {

  email: string = '';
  password: string = '';
  loading: boolean = false;
  errorMessage: string = '';

  constructor(
    private supabaseService: SupabaseService,
    private router: Router,
    private toastService: ToastService
  ) {}

  ngOnInit() {
    // Check if user is already authenticated (from OAuth callback)
    this.checkAuthAndRedirect();
  }

  async checkAuthAndRedirect() {
    try {
      const user = await this.supabaseService.getCurrentUser();
      
      if (user) {
        // User is already logged in (from OAuth or existing session)
        const profile = await this.supabaseService.getCurrentProfile();
        
        if (profile?.role) {
          console.log('OAuth/Session redirect - User role:', profile.role);
          
          // Redirect based on role (case-insensitive)
          switch (profile.role.toLowerCase()) {
            case 'admin':
              console.log('Redirecting to admin dashboard');
              this.router.navigate(['/admin']);
              break;
            case 'landlord':
              console.log('Redirecting to landlord dashboard');
              this.router.navigate(['/landlord']);
              break;
            case 'tenant':
              console.log('Redirecting to tenant dashboard');
              this.router.navigate(['/tenant']);
              break;
            default:
              console.log('Unknown role, redirecting to home');
              this.router.navigate(['/']);
          }
        }
      }
    } catch (error) {
      console.error('Error checking auth status:', error);
      // Continue showing login page if there's an error
    }
  }

  // Email + Password Login
  async onLogin() {
    if (!this.email || !this.password) {
      this.errorMessage = 'Please enter email and password';
      this.toastService.error(this.errorMessage);
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    try {
      console.log('=== LOGIN STARTED ===');
      const { data, error } = await this.supabaseService.client.auth.signInWithPassword({
        email: this.email,
        password: this.password
      });

      if (error) throw error;

      console.log('Auth successful for:', this.email);
      console.log('Auth user ID:', data?.user?.id);

      // Run verification
      console.log('\n=== RUNNING PROFILE VERIFICATION ===');
      await this.supabaseService.verifyProfileInDatabase();

      console.log('\n=== FETCHING PROFILE ===');
      const profile = await this.supabaseService.getCurrentProfile();
      
      if (!profile || !profile.role) {
        throw new Error('Unable to fetch user profile or role');
      }

      this.toastService.success('Login successful');

      const roleToCheck = (profile.role as string).toLowerCase().trim();
      console.log('\n=== ROLE REDIRECT DECISION ===');
      console.log('Final role to check:', roleToCheck);
      console.log('Comparing against:', ['admin', 'landlord', 'tenant']);
      
      // Role-based redirect
      switch (roleToCheck) {
        case 'admin':
          console.log('✓ Admin detected - navigating to /admin');
          this.router.navigate(['/admin']);
          break;
        case 'landlord':
          console.log('✓ Landlord detected - navigating to /landlord');
          this.router.navigate(['/landlord']);
          break;
        case 'tenant':
          console.log('✓ Tenant detected - navigating to /tenant');
          this.router.navigate(['/tenant']);
          break;
        default:
          console.error('✗ Unknown role detected:', roleToCheck);
          console.log('Falling back to home');
          this.router.navigate(['/']);
      }

    } catch (error: any) {
      this.errorMessage = error.message || 'Invalid email or password';
      this.toastService.error(this.errorMessage);
      console.error('Login error:', error);
    } finally {
      this.loading = false;
    }
  }

  // Google / Gmail Login
  async signInWithGoogle() {
    this.loading = true;
    this.errorMessage = '';

    try {
      const { error } = await this.supabaseService.client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + '/login'   // Change to your deployed URL later
        }
      });

      if (error) throw error;

    } catch (error: any) {
      this.errorMessage = error.message || 'Failed to sign in with Google';
      this.toastService.error(this.errorMessage);
    } finally {
      this.loading = false;
    }
  }
}