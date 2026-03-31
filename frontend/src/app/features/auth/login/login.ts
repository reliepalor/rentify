import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { SupabaseService } from '../../../core/services/supabase.service';
import { LoadingService } from '../../../shared/services/loading.service';
import { ModalService } from '../../../shared/services/modal.service';
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
    private loadingService: LoadingService,
    private modalService: ModalService,
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
        this.loadingService.show('Checking your account...');

        // User is already logged in (from OAuth or existing session)
        const profile = await this.supabaseService.getCurrentProfileStrict();

        if (!profile?.role) {
          await this.supabaseService.client.auth.signOut();
          this.modalService.error(
            'Account Not Registered',
            'This account does not have a registration record yet. Please register first.'
          );
          return;
        }
        
        // Redirect based on role (case-insensitive)
        switch (profile.role.toLowerCase()) {
          case 'admin':
            this.router.navigate(['/admin']);
            break;
          case 'landlord':
            this.router.navigate(['/landlord']);
            break;
          case 'tenant':
            this.router.navigate(['/tenant']);
            break;
          default:
            this.router.navigate(['/']);
        }
      }
    } catch (error) {
      console.error('Unable to verify session.');
      // Continue showing login page if there's an error
    } finally {
      this.loadingService.hide();
    }
  }

  // Email + Password Login
  async onLogin() {
    if (!this.email || !this.password) {
      this.modalService.info('Missing Information', 'Please enter email and password.');
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.loadingService.show('Signing you in...');

    try {
      const { error } = await this.supabaseService.client.auth.signInWithPassword({
        email: this.email,
        password: this.password
      });

      if (error) throw error;

      const profile = await this.supabaseService.getCurrentProfileStrict();
      
      if (!profile || !profile.role) {
        await this.supabaseService.client.auth.signOut();
        this.modalService.error(
          'Account Not Registered',
          'This account does not have a registration record yet. Please register first.'
        );
        return;
      }

      this.toastService.success('Login successful');

      const roleToCheck = (profile.role as string).toLowerCase().trim();
      
      // Role-based redirect
      switch (roleToCheck) {
        case 'admin':
          this.router.navigate(['/admin']);
          break;
        case 'landlord':
          this.router.navigate(['/landlord']);
          break;
        case 'tenant':
          this.router.navigate(['/tenant']);
          break;
        default:
          console.error('Invalid role detected during login.');
          this.router.navigate(['/']);
      }

    } catch (error: any) {
      this.modalService.error('Login Failed', 'Invalid email or password.');
      console.error('Login failed.');
    } finally {
      this.loadingService.hide();
      this.loading = false;
    }
  }

  // Google / Gmail Login
  async signInWithGoogle() {
    this.loading = true;
    this.errorMessage = '';
    this.loadingService.show('Redirecting to Google...');

    try {
      const { error } = await this.supabaseService.client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + '/login'   // Change to your deployed URL later
        }
      });

      if (error) throw error;

    } catch (error: any) {
      this.modalService.error('Google Sign In Failed', 'Unable to sign in with Google. Please try again.');
    } finally {
      this.loadingService.hide();
      this.loading = false;
    }
  }
}