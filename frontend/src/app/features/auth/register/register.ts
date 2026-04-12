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

  email: string = '';
  password: string = '';
  confirmPassword: string = '';
  selectedRole: 'tenant' | 'landlord' = 'tenant';
  loading: boolean = false;
  errorMessage: string = '';
  successMessage: string = '';
  showPassword: boolean = false;
  showConfirmPassword: boolean = false;
  private isHandlingOAuthCallback: boolean = false;
  private readonly oauthIntentKey: string = 'register_google_intent';

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

    const isGoogleRegistrationFlow = sessionStorage.getItem(this.oauthIntentKey) === '1';
    if (!isGoogleRegistrationFlow) return;

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
        sessionStorage.removeItem(this.oauthIntentKey);

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
      sessionStorage.setItem(this.oauthIntentKey, '1');

      const { error } = await this.supabaseService.client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + '/register'
        }
      });

      if (error) throw error;

    } catch (error: any) {
      this.modalService.error('Google Sign Up Failed', 'Unable to continue with Google. Please try again.');
      sessionStorage.removeItem(this.oauthIntentKey);
      this.loading = false;
    }
  }

  async onRegister() {
    if (!this.email || !this.password || !this.confirmPassword) {
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
      const derivedFullName = this.deriveDisplayNameFromEmail(this.email);

      // 1. Create user in Supabase Auth
      let { data, error } = await this.supabaseService.client.auth.signUp({
        email: this.email.trim().toLowerCase(),
        password: this.password,
        options: {
          data: {
            full_name: derivedFullName,
            role: this.selectedRole.toLowerCase()
          }
        }
      });

      // Fallback path: retry with minimal payload if metadata/signup settings reject the first attempt.
      if (error) {
        const retry = await this.supabaseService.client.auth.signUp({
          email: this.email.trim().toLowerCase(),
          password: this.password
        });

        data = retry.data;
        error = retry.error;
      }

      if (error) throw error;

      if (data?.session && data.user?.id) {
        try {
          await this.ensureProfileExists(data.user.id, this.selectedRole, derivedFullName || null);
        } catch (profileError) {
          // Do not block successful auth registration if profile sync is delayed.
          console.warn('Profile sync warning after signup:', profileError);
        }
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
      const message = this.getRegistrationErrorMessage(error);
      this.modalService.error('Registration Failed', message);
      console.error('Registration failed:', error);
    } finally {
      this.loadingService.hide();
      this.loading = false;
    }
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  toggleConfirmPasswordVisibility(): void {
    this.showConfirmPassword = !this.showConfirmPassword;
  }

  private deriveDisplayNameFromEmail(email: string): string {
    const localPart = email.split('@')[0]?.trim() || 'User';
    return localPart
      .replace(/[._-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, (character) => character.toUpperCase());
  }

  private getRegistrationErrorMessage(error: any): string {
    const code = String(error?.code || '').toLowerCase();
    const details = typeof error?.message === 'string' ? error.message : '';

    if (code === 'email_address_invalid') {
      return 'Please enter a valid email format, like yourname@gmail.com. Test domains like example.com are rejected.';
    }

    if (code === 'over_email_send_rate_limit') {
      return 'Too many signup attempts in a short time. Please wait a few minutes, then try again.';
    }

    if (code === 'user_already_exists' || code === 'email_exists') {
      return 'This email is already registered. Please sign in instead.';
    }

    return details || 'Failed to create account. Please try again.';
  }
}