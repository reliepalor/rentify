import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { SupabaseService } from '../../../core/services/supabase.service';
import { LoadingService } from '../../../shared/services/loading.service';
import { ModalService } from '../../../shared/services/modal.service';
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
  private isHandlingOAuthCallback: boolean = false;

  constructor(
    private supabaseService: SupabaseService,
    private router: Router,
    private loadingService: LoadingService,
    private modalService: ModalService,
    private toastService: ToastService
  ) {}

  ngOnInit() {
    // Check if returning from Google OAuth
    this.checkGoogleAuthAndFinishRegistration();

    // Also listen for auth state changes because OAuth session restoration
    // can complete slightly after component initialization.
    this.supabaseService.client.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        this.checkGoogleAuthAndFinishRegistration();
      }
    });
  }

  async checkGoogleAuthAndFinishRegistration() {
    if (this.isHandlingOAuthCallback) return;

    try {
      this.isHandlingOAuthCallback = true;
      const user = await this.supabaseService.getCurrentUser();

      if (!user) return;

      this.loadingService.show('Finalizing registration...');

      const currentProfile = await this.supabaseService.getCurrentProfile();
      const storedRole = (sessionStorage.getItem('selected_role') as 'tenant' | 'landlord' | null);
      const currentRole = user.user_metadata?.['role'] as string | undefined;
      const profileRole = currentProfile?.role as string | undefined;
      const roleToApply = this.normalizeRole(storedRole || currentRole || profileRole);

      // Keep auth metadata and profiles.role aligned.
      if (!currentRole || currentRole.toLowerCase().trim() !== roleToApply) {
        const { error: metadataError } = await this.supabaseService.client.auth.updateUser({
          data: {
            role: roleToApply,
            full_name: user.user_metadata?.['full_name'] || ''
          }
        });

        if (metadataError) {
          console.error('Failed to update user profile metadata.');
        }
      }

      await this.ensureProfileExists(user.id, roleToApply, user.user_metadata?.['full_name'] || null);

      sessionStorage.removeItem('selected_role');

      this.toastService.success('Google sign up successful. Redirecting...');
      this.router.navigate([roleToApply === 'landlord' ? '/landlord' : '/tenant']);
    } catch (error) {
      console.error('Google registration flow failed.');
      setTimeout(() => {
        this.modalService.error('Google Sign Up Failed', 'Unable to complete Google sign up. Please try again.');
      });
    } finally {
      this.loadingService.hide();
      this.isHandlingOAuthCallback = false;
    }
  }

  private async ensureProfileExists(
    userId: string,
    role: 'tenant' | 'landlord',
    fullName: string | null
  ) {
    const { data: existingProfile, error: selectError } = await this.supabaseService.client
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    if (selectError) {
      console.error('Failed to check account profile.');
      throw new Error('Failed to process account profile');
    }

    if (existingProfile) {
      const { error: updateError } = await this.supabaseService.client
        .from('profiles')
        .update({ role, full_name: fullName })
        .eq('id', userId);

      if (updateError) {
        console.error('Failed to update account profile.');
        throw new Error('Failed to process account profile');
      }

      return;
    }

    const { error: insertError } = await this.supabaseService.client
      .from('profiles')
      .insert({
        id: userId,
        role,
        full_name: fullName
      });

    if (insertError) {
      console.error('Failed to create account profile.');
      throw new Error('Failed to process account profile');
    }
  }

  private normalizeRole(roleValue?: string | null): 'tenant' | 'landlord' {
    const normalized = (roleValue || '').toLowerCase().trim();
    return normalized === 'landlord' ? 'landlord' : 'tenant';
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
      this.modalService.error('Google Sign Up Failed', 'Unable to continue with Google. Please try again.');
      this.loading = false;
    }
  }

  async onRegister() {
    if (!this.fullName || !this.email || !this.password || !this.confirmPassword) {
      this.modalService.info('Missing Information', 'Please fill in all required fields.');
      return;
    }

    if (this.password !== this.confirmPassword) {
      this.modalService.info('Password Mismatch', 'Passwords do not match.');
      return;
    }

    if (this.password.length < 6) {
      this.modalService.info('Weak Password', 'Password must be at least 6 characters.');
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';
    this.loadingService.show('Creating your account...');

    try {
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

      if (data?.session && data.user?.id) {
        await this.ensureProfileExists(data.user.id, this.selectedRole, this.fullName || null);
      }

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
      this.modalService.error('Registration Failed', 'Failed to create account. Please try again.');
      console.error('Registration failed.');
    } finally {
      this.loadingService.hide();
      this.loading = false;
    }
  }
}