import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { SupabaseService } from '../../../core/services/supabase.service';
import { ToastService } from '../../../shared/services/toast.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './register.html'
})
export class RegisterComponent implements OnInit {

  fullName: string = '';
  email: string = '';
  password: string = '';
  confirmPassword: string = '';
  selectedRole: 'tenant' | 'landlord' = 'tenant';
  loading: boolean = false;
  errorMessage: string = '';
  successMessage: string = '';

  constructor(
    private supabaseService: SupabaseService,
    private router: Router,
    private toastService: ToastService
  ) {}

  ngOnInit() {
    // Check if returning from Google OAuth
    this.checkGoogleAuthAndFinishRegistration();
  }

  async checkGoogleAuthAndFinishRegistration() {
    try {
      const user = await this.supabaseService.getCurrentUser();
      
      if (user && !user.user_metadata?.['role']) {
        // User just signed up with Google but doesn't have a role yet
        const storedRole = sessionStorage.getItem('selected_role') as 'tenant' | 'landlord' || 'tenant';
        
        // Update user metadata with role
        await this.supabaseService.client.auth.updateUser({
          data: {
            role: storedRole,
            full_name: user.user_metadata?.['full_name'] || ''
          }
        });

        // Clear stored role
        sessionStorage.removeItem('selected_role');
        
        this.toastService.success('Account created successfully! Redirecting to login...');
        
        // Redirect to login
        setTimeout(() => {
          this.router.navigate(['/login']);
        }, 1500);
      }
    } catch (error) {
      console.error('Error finishing Google registration:', error);
    }
  }

  selectRole(role: 'tenant' | 'landlord') {
    this.selectedRole = role;
    // Store selected role in session storage for OAuth flow
    sessionStorage.setItem('selected_role', role);
  }

  // Google OAuth Sign Up
  async signInWithGoogle() {
    this.loading = true;
    this.errorMessage = '';

    try {
      // Store selected role before redirecting to Google
      sessionStorage.setItem('selected_role', this.selectedRole);

      const { error } = await this.supabaseService.client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + '/register'
        }
      });

      if (error) throw error;

    } catch (error: any) {
      this.errorMessage = error.message || 'Failed to sign up with Google';
      this.toastService.error(this.errorMessage);
      this.loading = false;
    }
  }

  async onRegister() {
    if (!this.fullName || !this.email || !this.password || !this.confirmPassword) {
      this.errorMessage = 'Please fill all fields';
      this.toastService.error(this.errorMessage);
      return;
    }

    if (this.password !== this.confirmPassword) {
      this.errorMessage = 'Passwords do not match';
      this.toastService.error(this.errorMessage);
      return;
    }

    if (this.password.length < 6) {
      this.errorMessage = 'Password must be at least 6 characters';
      this.toastService.error(this.errorMessage);
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';

    try {
      console.log('=== REGISTRATION STARTED ===');
      console.log('Full Name:', this.fullName);
      console.log('Email:', this.email);
      console.log('Selected Role:', this.selectedRole);

      // 1. Create user in Supabase Auth
      const { data, error } = await this.supabaseService.client.auth.signUp({
        email: this.email,
        password: this.password,
        options: {
          data: {
            full_name: this.fullName,
            role: this.selectedRole.toLowerCase()
          }
        }
      });

      if (error) throw error;

      console.log('User created successfully');
      console.log('User ID:', data?.user?.id);
      console.log('User metadata:', data?.user?.user_metadata);

      const needsEmailVerification = !data.session;
      this.successMessage = needsEmailVerification
        ? 'Account created. Please verify your email before signing in.'
        : 'Account created successfully. You can now sign in.';
      this.toastService.success(this.successMessage, 4000);

      // Auto redirect to login after 2 seconds
      setTimeout(() => {
        this.router.navigate(['/login']);
      }, 2500);

    } catch (error: any) {
      this.errorMessage = error.message || 'Failed to create account';
      this.toastService.error(this.errorMessage);
      console.error('Register error:', error);
    } finally {
      this.loading = false;
    }
  }
}