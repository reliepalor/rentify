import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { SupabaseService } from '../../../core/services/supabase.service';
import { LandlordService } from '../../../core/services/landlord.service';
import { LoadingService } from '../../../shared/services/loading.service';
import { ModalService } from '../../../shared/services/modal.service';
import { ToastService } from '../../../shared/services/toast.service';

type LandlordDocumentType = 'business_permit' | 'barangay_clearance' | 'valid_id';

interface LandlordDocumentDraft {
  fileName: string;
  mimeType: string;
  dataUrl: string;
}

interface LandlordRegistrationDraft {
  full_name: string;
  contact_number: string;
  documents: Record<LandlordDocumentType, LandlordDocumentDraft>;
}

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
  showLandlordModal: boolean = false;
  landlordFullName: string = '';
  landlordContactNumber: string = '';
  landlordDocumentFiles: Record<LandlordDocumentType, File | null> = {
    business_permit: null,
    barangay_clearance: null,
    valid_id: null
  };
  landlordDocumentNames: Record<LandlordDocumentType, string> = {
    business_permit: '',
    barangay_clearance: '',
    valid_id: ''
  };
  private isHandlingOAuthCallback: boolean = false;
  private readonly oauthIntentKey: string = 'register_google_intent';
  private readonly landlordDraftKey: string = 'register_landlord_draft';
  private pendingRegistrationAction: 'email' | 'google' | null = null;

  constructor(
    private supabaseService: SupabaseService,
    private landlordService: LandlordService,
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
    let postFinalizeModalMessage: string | null = null;

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
      const landlordDraft = this.getLandlordRegistrationDraft();
      const roleToApply = this.normalizeRole(storedRole || currentRole || profileRole || (landlordDraft ? 'landlord' : null));
      const fullNameToApply = landlordDraft?.full_name || user.user_metadata?.['full_name'] || this.deriveDisplayNameFromEmail(user.email || 'User');
      const contactNumberToApply = landlordDraft?.contact_number || user.user_metadata?.['contact_number'] || null;

      // Keep auth metadata and profiles.role aligned.
      if (!currentRole || currentRole.toLowerCase().trim() !== roleToApply) {
        const { error: metadataError } = await this.supabaseService.client.auth.updateUser({
          data: {
            role: roleToApply,
            full_name: fullNameToApply,
            contact_number: contactNumberToApply || ''
          }
        });

        if (metadataError) {
          console.error('Failed to update user profile metadata.');
        }
      }

      await this.ensureProfileExists(user.id, roleToApply, fullNameToApply || null, contactNumberToApply);

      if (landlordDraft) {
        await this.syncLandlordDocuments(user.id, landlordDraft);
        this.clearLandlordVerificationDraft();
      }

      sessionStorage.removeItem('selected_role');
        sessionStorage.removeItem(this.oauthIntentKey);

      this.toastService.success('Google sign up successful. Redirecting...');

      if (roleToApply === 'landlord') {
        const summary = await this.landlordService.getLandlordVerificationSummary(user.id);

        if (!summary || summary.status !== 'approved') {
          postFinalizeModalMessage = 'You are all set. Your landlord account is now under review. Please try logging in again after admin approval.';
          this.router.navigate(['/landing']);
          return;
        }

        this.router.navigate(['/landlord']);
        return;
      }

      this.router.navigate(['/tenant']);
    } catch (error) {
      console.error('Google registration flow failed.');
      setTimeout(() => {
        this.modalService.error('Google Sign Up Failed', 'Unable to complete Google sign up. Please try again.');
      });
    } finally {
      this.loadingService.hide();
      this.isHandlingOAuthCallback = false;

      if (postFinalizeModalMessage) {
        setTimeout(() => {
          this.modalService.info('Verification In Progress', postFinalizeModalMessage as string);
        }, 150);
      }
    }
  }

  private async ensureProfileExists(
    userId: string,
    role: 'tenant' | 'landlord',
    fullName: string | null,
    contactNumber: string | null = null
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
        .update({ role, full_name: fullName, contact_number: contactNumber })
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
        full_name: fullName,
        contact_number: contactNumber
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

  private async continueWithGoogleForExistingAccount(emailHint: string): Promise<void> {
    if (this.selectedRole === 'landlord' && !this.getLandlordRegistrationDraft()) {
      this.pendingRegistrationAction = 'google';
      this.openLandlordModal();
      this.modalService.info('Landlord Verification Needed', 'Please complete the landlord verification form before continuing with Google.');
      return;
    }

    sessionStorage.setItem('selected_role', this.selectedRole.toLowerCase());
    sessionStorage.setItem(this.oauthIntentKey, '1');

    const { error } = await this.supabaseService.client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + '/register',
        queryParams: {
          login_hint: emailHint
        }
      }
    });

    if (error) {
      throw error;
    }
  }

  selectRole(role: 'tenant' | 'landlord') {
    this.selectedRole = role;
    // Store selected role in session storage for OAuth flow
    sessionStorage.setItem('selected_role', role);

    if (role === 'landlord') {
      this.openLandlordModal();
      return;
    }

    this.showLandlordModal = false;
    this.clearLandlordVerificationDraft();
  }

  // Google OAuth Sign Up
  async signInWithGoogle() {
    if (this.selectedRole === 'landlord' && !this.getLandlordRegistrationDraft()) {
      this.pendingRegistrationAction = 'google';
      this.openLandlordModal();
      return;
    }

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
      const landlordDraft = this.getLandlordRegistrationDraft();
      if (this.selectedRole === 'landlord' && !landlordDraft) {
        this.loadingService.hide();
        this.loading = false;
        this.pendingRegistrationAction = 'email';
        this.openLandlordModal();
        this.modalService.info('Landlord Verification Needed', 'Please complete the landlord verification form before creating the account.');
        return;
      }

      const derivedFullName = landlordDraft?.full_name?.trim() || this.deriveDisplayNameFromEmail(this.email);
      const contactNumber = landlordDraft?.contact_number?.trim() || null;

      // 1. Create user in Supabase Auth
      let { data, error } = await this.supabaseService.client.auth.signUp({
        email: this.email.trim().toLowerCase(),
        password: this.password,
        options: {
          data: {
            full_name: derivedFullName,
            role: this.selectedRole.toLowerCase(),
            contact_number: contactNumber || ''
          }
        }
      });

      if (error && this.isExistingEmailRegistrationError(error)) {
        this.modalService.info(
          'Use Your Existing Google Account',
          'Please use your existing Google account to continue.'
        );
        return;
      }

      if (error && this.isSignupRateLimitError(error)) {
        this.modalService.info(
          'Use Your Existing Google Account',
          'Please use your existing Google account to continue.'
        );
        return;
      }

      if (error) throw error;

      if (data?.session && data.user?.id) {
        try {
          await this.ensureProfileExists(data.user.id, this.selectedRole, derivedFullName || null, contactNumber);

          if (this.selectedRole === 'landlord' && landlordDraft) {
            await this.syncLandlordDocuments(data.user.id, landlordDraft);
            this.clearLandlordVerificationDraft();
          }
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

  openLandlordModal(): void {
    this.showLandlordModal = true;
  }

  closeLandlordModal(): void {
    this.showLandlordModal = false;
  }

  onLandlordDocumentSelected(event: Event, type: LandlordDocumentType): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] || null;

    this.landlordDocumentFiles[type] = file;
    this.landlordDocumentNames[type] = file?.name || '';
  }

  async saveLandlordVerificationDetails(): Promise<void> {
    if (!this.landlordFullName.trim() || !this.landlordContactNumber.trim()) {
      this.modalService.info('Missing Information', 'Please provide the landlord full name and contact number.');
      return;
    }

    if (!this.landlordDocumentFiles.business_permit || !this.landlordDocumentFiles.barangay_clearance || !this.landlordDocumentFiles.valid_id) {
      this.modalService.info('Missing Documents', 'Please upload the Business Permit, Barangay Clearance, and Valid ID.');
      return;
    }

    const draft: LandlordRegistrationDraft = {
      full_name: this.landlordFullName.trim(),
      contact_number: this.landlordContactNumber.trim(),
      documents: {
        business_permit: await this.fileToDraft(this.landlordDocumentFiles.business_permit),
        barangay_clearance: await this.fileToDraft(this.landlordDocumentFiles.barangay_clearance),
        valid_id: await this.fileToDraft(this.landlordDocumentFiles.valid_id)
      }
    };

    sessionStorage.setItem(this.landlordDraftKey, JSON.stringify(draft));
    sessionStorage.setItem('selected_role', 'landlord');
    this.showLandlordModal = false;
    this.toastService.success('Landlord verification details saved. You can now finish registration.');

    const pendingAction = this.pendingRegistrationAction;
    this.pendingRegistrationAction = null;

    if (pendingAction === 'google') {
      void this.signInWithGoogle();
      return;
    }

    if (pendingAction === 'email') {
      void this.onRegister();
    }
  }

  private clearLandlordVerificationDraft(): void {
    sessionStorage.removeItem(this.landlordDraftKey);
  }

  private isExistingEmailRegistrationError(error: any): boolean {
    const code = String(error?.code || '').toLowerCase();
    const message = String(error?.message || '').toLowerCase();

    return (
      code === 'user_already_exists' ||
      code === 'email_exists' ||
      message.includes('already registered') ||
      message.includes('already exists') ||
      message.includes('user already exists') ||
      message.includes('email exists')
    );
  }

  private isSignupRateLimitError(error: any): boolean {
    const code = String(error?.code || '').toLowerCase();
    const message = String(error?.message || '').toLowerCase();

    return code === 'over_email_send_rate_limit' || message.includes('rate limit') || message.includes('too many signup attempts');
  }

  private getLandlordRegistrationDraft(): LandlordRegistrationDraft | null {
    const rawDraft = sessionStorage.getItem(this.landlordDraftKey);

    if (!rawDraft) {
      return null;
    }

    try {
      return JSON.parse(rawDraft) as LandlordRegistrationDraft;
    } catch {
      return null;
    }
  }

  private async syncLandlordDocuments(userId: string, draft: LandlordRegistrationDraft): Promise<void> {
    const documents = [
      { type: 'business_permit' as const, file: draft.documents['business_permit'] },
      { type: 'barangay_clearance' as const, file: draft.documents['barangay_clearance'] },
      { type: 'valid_id' as const, file: draft.documents['valid_id'] }
    ];

    await Promise.all(
      documents.map(async (document) => {
        const storagePath = `${userId}/${document.type}/${Date.now()}-${document.file.fileName}`;
        const fileBlob = await this.dataUrlToBlob(document.file.dataUrl);

        const { error: uploadError } = await this.supabaseService.client.storage
          .from('landlord-documents')
          .upload(storagePath, fileBlob, {
            contentType: document.file.mimeType,
            upsert: true
          });

        if (uploadError) {
          throw uploadError;
        }

        const { error: insertError } = await this.supabaseService.client
          .from('documents')
          .upsert({
            landlord_id: userId,
            type: document.type,
            file_url: storagePath,
            uploaded_at: new Date().toISOString()
          }, {
            onConflict: 'landlord_id,type'
          });

        if (insertError) {
          throw insertError;
        }
      })
    );
  }

  private async fileToDraft(file: File): Promise<LandlordDocumentDraft> {
    return {
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      dataUrl: await this.readFileAsDataUrl(file)
    };
  }

  private readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Unable to read uploaded document.'));
      reader.readAsDataURL(file);
    });
  }

  private async dataUrlToBlob(dataUrl: string): Promise<Blob> {
    const response = await fetch(dataUrl);
    return response.blob();
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
      return 'Please enter a valid email address. Test accounts are allowed as long as the format is valid.';
    }

    if (code === 'over_email_send_rate_limit') {
      return 'Please use your existing Google account to continue.';
    }

    if (code === 'user_already_exists' || code === 'email_exists') {
      return 'Please use your existing Google account to continue.';
    }

    return details || 'Failed to create account. Please try again.';
  }
}