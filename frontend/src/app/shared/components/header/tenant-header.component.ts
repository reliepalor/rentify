import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { SupabaseService } from '../../../core/services/supabase.service';
import { LandlordService, LandlordVerificationStatus } from '../../../core/services/landlord.service';
import { LoadingService } from '../../services/loading.service';
import { ModalService } from '../../services/modal.service';
import { ToastService } from '../../services/toast.service';
import { Subscription } from 'rxjs';

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

interface MenuItem {
  label: string;
  href: string;
  active: boolean;
}

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './tenant-header.component.html',
  styles: [`
    .tenant-glass-header {
      background: linear-gradient(to bottom, rgba(10, 15, 11, 0.28), rgba(10, 15, 11, 0.12));
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      border-bottom: 1px solid rgba(255, 255, 255, 0.14);
      transition: transform 220ms ease, opacity 220ms ease;
    }

    .tenant-glass-header.header-hidden {
      transform: translateY(-110%);
      opacity: 0;
      pointer-events: none;
    }

    .tenant-glass-header.header-visible {
      transform: translateY(0);
      opacity: 1;
    }

    .tenant-readable {
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.45);
    }

    .auth-panel-overlay {
      transition: opacity 320ms ease;
    }

    .auth-panel-overlay-open {
      opacity: 1;
    }

    .auth-panel-overlay-closed {
      opacity: 0;
      pointer-events: none;
    }

    .auth-panel {
      transition: transform 320ms cubic-bezier(0.22, 1, 0.36, 1), opacity 320ms ease;
      will-change: transform, opacity;
    }

    .auth-panel-closed {
      transform: translateX(108%);
      opacity: 0;
      pointer-events: none;
    }

    .auth-panel-open {
      transform: translateX(0);
      opacity: 1;
    }

    .auth-track {
      width: 200%;
      transition: transform 320ms cubic-bezier(0.22, 1, 0.36, 1);
      will-change: transform;
    }

    .auth-mode-pane {
      transition: opacity 220ms ease, transform 220ms ease;
    }

    .auth-mode-pane-active {
      opacity: 1;
      transform: translateX(0);
    }

    .auth-mode-pane-inactive {
      opacity: 0.68;
      transform: translateX(-8px);
    }
  `]
})
export class TenantHeaderComponent implements OnInit, OnDestroy {
  isHeaderVisible = true;
  isAuthPanelOpen = false;
  isAuthPanelMounted = false;
  authMode: 'login' | 'register' = 'login';
  isLoggedIn = false;

  loginEmail = '';
  loginPassword = '';

  registerEmail = '';
  registerPassword = '';
  registerConfirmPassword = '';
  showRegisterPassword = false;
  showRegisterConfirmPassword = false;
  selectedRole: 'tenant' | 'landlord' = 'tenant';
  showLandlordModal = false;
  showContinueRegistrationModal = false;
  showReviewWaitModal = false;
  continueRegistrationMessage = '';
  reviewWaitMessage = '';
  landlordFullName = '';
  landlordContactNumber = '';
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

  authLoading = false;
  private isHandlingOAuthCallback = false;
  private readonly landlordDraftKey = 'register_landlord_draft';
  private readonly landlordReviewWaitKey = 'landlord_review_wait';

  private lastScrollY = 0;
  private readonly scrollThreshold = 8;
  private readonly authPanelAnimationMs = 320;
  private readonly oauthCallbackParam = 'auth_callback';
  private authStateSubscription?: { unsubscribe: () => void };
  private routeEventsSubscription?: Subscription;

  menuItems: MenuItem[] = [
    { label: 'Browse Properties', href: '/tenant-landing', active: true },
    { label: 'Property Details', href: '/tenant-property', active: false },
    { label: 'About', href: '#sobre', active: false },
    { label: 'Contact', href: '#contato', active: false }
  ];

  constructor(
    private supabaseService: SupabaseService,
    private landlordService: LandlordService,
    private router: Router,
    private loadingService: LoadingService,
    private modalService: ModalService,
    private toastService: ToastService
  ) {}

  ngOnInit(): void {
    this.lastScrollY = window.scrollY || 0;
    this.syncMenuWithCurrentRoute();

    // Check current session on init
    this.supabaseService.client.auth.getSession().then(({ data }) => {
      this.isLoggedIn = !!data.session;
    });

    // Defer async auth mutations to the next macrotask to avoid NG0100 in dev mode.
    window.setTimeout(() => {
      void this.handleOAuthReturnInPlace();
    }, 0);

    const pendingReviewMessage = sessionStorage.getItem(this.landlordReviewWaitKey);
    if (pendingReviewMessage) {
      this.reviewWaitMessage = pendingReviewMessage;
      this.showReviewWaitModal = true;
    }

    const { data } = this.supabaseService.client.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        this.isLoggedIn = true;
        window.setTimeout(() => {
          void this.handleOAuthReturnInPlace();
        }, 0);
      } else if (event === 'SIGNED_OUT') {
        this.isLoggedIn = false;
      }
    });

    this.authStateSubscription = data.subscription;

    this.routeEventsSubscription = this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.syncMenuWithCurrentRoute();
      }
    });
  }

  ngOnDestroy(): void {
    this.authStateSubscription?.unsubscribe();
    this.routeEventsSubscription?.unsubscribe();
    document.body.style.overflow = '';
  }

  onMenuClick(index: number) {
    if (this.menuItems[index].href.startsWith('/')) {
      return;
    }

    this.menuItems.forEach((item, i) => {
      item.active = i === index;
    });
  }

  isMenuItemActive(item: MenuItem): boolean {
    if (item.href.startsWith('/')) {
      const currentPath = this.router.url.split('?')[0].split('#')[0];
      return currentPath === item.href || currentPath.startsWith(item.href + '/');
    }

    return item.active;
  }

  private syncMenuWithCurrentRoute(): void {
    const currentPath = this.router.url.split('?')[0].split('#')[0];

    this.menuItems = this.menuItems.map((item) => {
      if (!item.href.startsWith('/')) {
        return item;
      }

      const isActive = currentPath === item.href || currentPath.startsWith(item.href + '/');
      return { ...item, active: isActive };
    });
  }

  async navigateToUserProfile(): Promise<void> {
    try {
      const profile = await this.supabaseService.getCurrentProfileStrict();
      if (profile?.role) {
        const role = profile.role.toLowerCase().trim();
        switch (role) {
          case 'admin':
            this.router.navigate(['/admin']);
            break;
          case 'landlord':
            this.router.navigate(['/landlord']);
            break;
          case 'tenant':
            this.router.navigate(['/tenant-profile']);
            break;
          default:
            this.router.navigate(['/landing']);
        }
      }
    } catch {
      this.modalService.error('Error', 'Unable to navigate to profile.');
    }
  }

  openAuthPanel(mode: 'login' | 'register' = 'login'): void {
    this.authMode = mode;
    this.isAuthPanelMounted = true;
    this.isAuthPanelOpen = true;
    document.body.style.overflow = 'hidden';
  }

  closeAuthPanel(): void {
    this.isAuthPanelOpen = false;

    window.setTimeout(() => {
      this.isAuthPanelMounted = false;
      document.body.style.overflow = '';
    }, this.authPanelAnimationMs);
  }

  showRegister(): void {
    this.authMode = 'register';
  }

  showLogin(): void {
    this.authMode = 'login';
  }

  selectRole(role: 'tenant' | 'landlord'): void {
    this.selectedRole = role;

    if (role === 'landlord') {
      this.openLandlordModal();
      return;
    }

    this.showLandlordModal = false;
    sessionStorage.removeItem(this.landlordDraftKey);
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
        business_permit: await this.fileToDraft(this.landlordDocumentFiles['business_permit']!),
        barangay_clearance: await this.fileToDraft(this.landlordDocumentFiles['barangay_clearance']!),
        valid_id: await this.fileToDraft(this.landlordDocumentFiles['valid_id']!)
      }
    };

    sessionStorage.setItem(this.landlordDraftKey, JSON.stringify(draft));
    this.showLandlordModal = false;
    this.showContinueRegistrationModal = true;
    this.continueRegistrationMessage = this.selectedRole === 'landlord'
      ? 'Your verification details are saved. Continue with your Google account to finish registration.'
      : 'Your registration details are saved.';
    this.toastService.success('Landlord verification details saved.');
  }

  closeContinueRegistrationModal(): void {
    this.showContinueRegistrationModal = false;
  }

  async continueRegistration(): Promise<void> {
    this.showContinueRegistrationModal = false;

    if (this.selectedRole === 'landlord') {
      await this.onGoogleRegister();
      return;
    }

    await this.onRegisterSubmit();
  }

  closeReviewWaitModal(): void {
    this.showReviewWaitModal = false;
    sessionStorage.removeItem(this.landlordReviewWaitKey);
  }

  onOverlayClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.closeAuthPanel();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.isAuthPanelOpen) {
      this.closeAuthPanel();
    }
  }

  async onLoginSubmit(): Promise<void> {
    if (!this.loginEmail || !this.loginPassword) {
      this.modalService.info('Missing Information', 'Please enter email and password.');
      return;
    }

    this.authLoading = true;
    this.loadingService.show('Signing you in...');

    try {
      const { error } = await this.supabaseService.client.auth.signInWithPassword({
        email: this.loginEmail,
        password: this.loginPassword
      });

      if (error) throw error;

      const profile = await this.supabaseService.getCurrentProfileStrict();
      if (!profile?.role) {
        await this.supabaseService.client.auth.signOut();
        this.modalService.error(
          'Account Not Registered',
          'This account does not have a registration record yet. Please register first.'
        );
        return;
      }

      const landingDecision = await this.resolvePostAuthNavigation(profile.id, profile.role as string);

      if (String(profile.role || '').toLowerCase().trim() === 'landlord' && landingDecision.destination === '/landing') {
        this.modalService.info(
          'Account Not Yet Approved',
          landingDecision.message || 'Thanks for signing up! Your landlord account is still under review. Please try logging in again once the admin approves your account.'
        );
      } else {
        this.toastService.success('Login successful');
      }

      this.closeAuthPanel();
      this.navigateByResolvedDecision(landingDecision);
    } catch {
      this.modalService.error('Login Failed', 'Invalid email or password.');
    } finally {
      this.loadingService.hide();
      this.authLoading = false;
    }
  }

  async onGoogleLogin(): Promise<void> {
    if (this.authLoading) {
      return;
    }

    this.authLoading = true;
    this.loadingService.show('Redirecting to Google...');

    try {
      sessionStorage.setItem('auth_intent', 'login');

      const { error } = await this.supabaseService.client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: this.getCurrentPageOAuthRedirectUrl()
        }
      });

      if (error) throw error;
    } catch {
      this.modalService.error('Google Sign In Failed', 'Unable to sign in with Google. Please try again.');
    } finally {
      this.loadingService.hide();
      this.authLoading = false;
    }
  }

  async onRegisterSubmit(): Promise<void> {
    if (
      !this.registerEmail ||
      !this.registerPassword ||
      !this.registerConfirmPassword
    ) {
      this.modalService.info('Missing Information', 'Please fill in all required fields.');
      return;
    }

    if (this.registerPassword !== this.registerConfirmPassword) {
      this.modalService.info('Password Mismatch', 'Passwords do not match.');
      return;
    }

    if (this.registerPassword.length < 6) {
      this.modalService.info('Weak Password', 'Password must be at least 6 characters.');
      return;
    }

    this.authLoading = true;
    this.loadingService.show('Creating your account...');

    try {
      const landlordDraft = this.getLandlordRegistrationDraft();

      if (this.selectedRole === 'landlord' && !landlordDraft) {
        this.authLoading = false;
        this.loadingService.hide();
        this.openLandlordModal();
        this.modalService.info('Landlord Verification Needed', 'Please complete the landlord verification form before creating the account.');
        return;
      }

      const derivedFullName = landlordDraft?.full_name?.trim() || this.deriveDisplayNameFromEmail(this.registerEmail);
      const contactNumber = landlordDraft?.contact_number?.trim() || null;

      let { data, error } = await this.supabaseService.client.auth.signUp({
        email: this.registerEmail.trim().toLowerCase(),
        password: this.registerPassword,
        options: {
          data: {
            full_name: derivedFullName,
            role: this.selectedRole,
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

      // Supabase can obfuscate existing-email signups by returning a user with empty identities and no explicit error.
      if (!error && this.isExistingEmailSignupResponse(data)) {
        await this.continueWithGoogleForExistingAccount(this.registerEmail.trim().toLowerCase());
        return;
      }

      if (error) throw error;

      if (data?.session && data.user?.id) {
        try {
          await this.ensureProfileExists(data.user.id, this.selectedRole, derivedFullName, contactNumber);

          if (this.selectedRole === 'landlord' && landlordDraft) {
            await this.syncLandlordDocuments(data.user.id, landlordDraft);
            sessionStorage.removeItem(this.landlordDraftKey);
          }
        } catch {
          // Allow successful auth registration even if profile sync is delayed.
        }
      }

      if (this.selectedRole === 'landlord' && data?.user?.id) {
        const landingDecision = await this.resolvePostAuthNavigation(data.user.id, 'landlord');
        this.reviewWaitMessage = landingDecision.message || 'Your landlord application is waiting for admin review. You will receive an email when the status changes.';
        sessionStorage.setItem(this.landlordReviewWaitKey, this.reviewWaitMessage);
        this.showReviewWaitModal = true;
        this.closeAuthPanel();
        this.router.navigate(['/landing']);
        return;
      }

      const landingDecision = data?.user?.id
        ? await this.resolvePostAuthNavigation(data.user.id, this.selectedRole)
        : { destination: '/landing' as const, message: this.selectedRole === 'landlord' ? 'Your application was submitted and is waiting for admin review.' : '' };

      if (this.selectedRole === 'landlord') {
        this.reviewWaitMessage = landingDecision.message || 'Your landlord application was submitted and is waiting for admin review. You will receive an email once the admin approves or rejects it.';
        sessionStorage.setItem(this.landlordReviewWaitKey, this.reviewWaitMessage);
        this.showReviewWaitModal = true;
      }

      this.toastService.success('Account created. You can now sign in.', 3500);
      // Avoid immediate authMode flips in the same check cycle (NG0100); keep the panel stable.
      this.loginEmail = this.registerEmail.trim().toLowerCase();
      this.loginPassword = '';
    } catch (error: any) {
      this.modalService.error('Registration Failed', this.getRegistrationErrorMessage(error));
    } finally {
      this.loadingService.hide();
      window.setTimeout(() => {
        this.authLoading = false;
      }, 0);
    }
  }

  async onGoogleRegister(): Promise<void> {
    if (this.authLoading) {
      return;
    }

    if (this.selectedRole === 'landlord' && !this.getLandlordRegistrationDraft()) {
      this.openLandlordModal();
      return;
    }

    this.authLoading = true;
    this.loadingService.show('Redirecting to Google...');

    try {
      sessionStorage.setItem('auth_intent', 'register');
      sessionStorage.setItem('selected_role', this.selectedRole);

      const { error } = await this.supabaseService.client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: this.getCurrentPageOAuthRedirectUrl()
        }
      });

      if (error) throw error;
    } catch {
      this.modalService.error('Google Sign Up Failed', 'Unable to continue with Google. Please try again.');
    } finally {
      this.loadingService.hide();
      this.authLoading = false;
    }
  }

  private async continueWithGoogleForExistingAccount(emailHint: string): Promise<void> {
    if (this.selectedRole === 'landlord' && !this.getLandlordRegistrationDraft()) {
      this.openLandlordModal();
      this.modalService.info('Landlord Verification Needed', 'Please complete the landlord verification form before continuing with Google.');
      return;
    }

    sessionStorage.setItem('auth_intent', 'register');
    sessionStorage.setItem('selected_role', this.selectedRole);
    this.authLoading = true;
    this.loadingService.show('Redirecting to Google...');

    try {
      const { error } = await this.supabaseService.client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: this.getCurrentPageOAuthRedirectUrl(),
          queryParams: {
            login_hint: emailHint
          }
        }
      });

      if (error) throw error;
    } catch {
      this.modalService.error('Google Sign Up Failed', 'Unable to continue with Google. Please try again.');
      sessionStorage.removeItem('auth_intent');
      this.authLoading = false;
    } finally {
      this.loadingService.hide();
      this.authLoading = false;
    }
  }

  private getCurrentPageOAuthRedirectUrl(): string {
    const url = new URL(window.location.href);
    url.hash = '';
    url.searchParams.set(this.oauthCallbackParam, '1');
    return url.toString();
  }

  private cleanupOAuthCallbackParam(): void {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(this.oauthCallbackParam)) {
      return;
    }

    url.searchParams.delete(this.oauthCallbackParam);
    const query = url.searchParams.toString();
    const cleaned = `${url.pathname}${query ? `?${query}` : ''}${url.hash}`;
    window.history.replaceState({}, document.title, cleaned);
  }

  private async handleOAuthReturnInPlace(): Promise<void> {
    const authIntent = sessionStorage.getItem('auth_intent') as 'login' | 'register' | null;
    const hasCallbackParam = new URL(window.location.href).searchParams.has(this.oauthCallbackParam);
    let postFinalizeModalMessage: string | null = null;

    if ((!authIntent && !hasCallbackParam) || this.isHandlingOAuthCallback) {
      return;
    }

    this.isHandlingOAuthCallback = true;
    this.authLoading = true;
    this.isAuthPanelMounted = true;
    this.isAuthPanelOpen = true;
    document.body.style.overflow = 'hidden';
    this.loadingService.show(authIntent === 'register' ? 'Finalizing registration...' : 'Signing you in...');

    try {
      const user = await this.supabaseService.getCurrentUser();
      if (!user) {
        return;
      }

      if (authIntent === 'register') {
        const landlordDraft = this.getLandlordRegistrationDraft();
        const roleFromStorage = (sessionStorage.getItem('selected_role') as 'tenant' | 'landlord' | null) || 'tenant';
        const normalizedRole = roleFromStorage === 'landlord' ? 'landlord' : 'tenant';
        const fullName = landlordDraft?.full_name?.trim() || user.user_metadata?.['full_name'] || this.deriveDisplayNameFromEmail(user.email || '');
        const contactNumber = landlordDraft?.contact_number?.trim() || null;

        const { error: metadataError } = await this.supabaseService.client.auth.updateUser({
          data: {
            role: normalizedRole,
            full_name: fullName,
            contact_number: contactNumber || ''
          }
        });

        if (metadataError) {
          throw metadataError;
        }

        await this.ensureProfileExists(
          user.id,
          normalizedRole,
          fullName,
          contactNumber
        );

        if (normalizedRole === 'landlord' && landlordDraft) {
          await this.syncLandlordDocuments(user.id, landlordDraft);
          sessionStorage.removeItem(this.landlordDraftKey);
        }
      }

      const profile = await this.supabaseService.getCurrentProfileStrict();
      if (!profile?.role) {
        await this.supabaseService.client.auth.signOut();
        this.modalService.error(
          'Account Not Registered',
          'This account does not have a registration record yet. Please register first.'
        );
        return;
      }

      const landingDecision = await this.resolvePostAuthNavigation(user.id, profile.role as string);

      if (authIntent === 'login' && String(profile.role || '').toLowerCase().trim() === 'landlord' && landingDecision.destination === '/landing') {
        this.modalService.info(
          'Account Not Yet Approved',
          landingDecision.message || 'Thanks for signing up! Your landlord account is still under review. Please try logging in again once the admin approves your account.'
        );
      } else {
        this.toastService.success(authIntent === 'register' ? 'Registration complete' : 'Login successful');
      }

      if (authIntent === 'register' && landingDecision.destination === '/landing' && landingDecision.message) {
        this.reviewWaitMessage = 'You are all set. Your landlord account is now under review. Please try logging in again after admin approval.';
        sessionStorage.setItem(this.landlordReviewWaitKey, this.reviewWaitMessage);
        postFinalizeModalMessage = this.reviewWaitMessage;
      }

      this.closeAuthPanel();
      this.navigateByResolvedDecision(landingDecision);
    } catch {
      this.modalService.error('Authentication Failed', 'Unable to complete Google sign in. Please try again.');
    } finally {
      sessionStorage.removeItem('auth_intent');
      sessionStorage.removeItem('selected_role');
      this.cleanupOAuthCallbackParam();
      this.loadingService.hide();
      this.authLoading = false;
      this.isHandlingOAuthCallback = false;

      if (postFinalizeModalMessage) {
        setTimeout(() => {
          this.modalService.info('Verification In Progress', postFinalizeModalMessage as string);
        }, 150);
      }
    }
  }

  private navigateByRole(role: string): void {
    const normalized = role.toLowerCase().trim();
    switch (normalized) {
      case 'admin':
        this.router.navigate(['/admin']);
        break;
      case 'landlord':
        this.router.navigate(['/landlord']);
        break;
      case 'tenant':
        this.router.navigate(['/tenant-landing']);
        break;
      default:
        this.router.navigate(['/landing']);
        break;
    }
  }

  private navigateByResolvedDecision(decision: { destination: '/landing' | '/admin' | '/tenant-landing' | '/landlord'; message?: string }): void {
    if (decision.destination === '/landing') {
      this.router.navigate(['/landing']);
      return;
    }

    this.router.navigate([decision.destination]);
  }

  private async resolvePostAuthNavigation(
    userId: string,
    role: string
  ): Promise<{ destination: '/landing' | '/admin' | '/tenant-landing' | '/landlord'; message?: string }> {
    const normalizedRole = role.toLowerCase().trim();

    if (normalizedRole !== 'landlord') {
      return { destination: normalizedRole === 'admin' ? '/admin' : '/tenant-landing' };
    }

    const summary = await this.landlordService.getLandlordVerificationSummary(userId);
    if (!summary || summary.status === 'pending' || summary.status === 'resubmission_required') {
      return {
        destination: '/landing',
        message: 'Thanks for signing up! Your landlord account is still under review. Please try logging in again once the admin approves your account.'
      };
    }

    if (summary.status === 'rejected') {
      return {
        destination: '/landing',
        message: 'Your landlord verification was rejected. Please check your email for the admin remarks and next steps.'
      };
    }

    return { destination: '/landlord' };
  }

  private isSignupRateLimitError(error: any): boolean {
    const code = String(error?.code || '').toLowerCase();
    const message = String(error?.message || '').toLowerCase();

    return code === 'over_email_send_rate_limit' || message.includes('rate limit') || message.includes('too many signup attempts');
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

  private async ensureProfileExists(
    userId: string,
    role: 'tenant' | 'landlord',
    fullName: string,
    contactNumber: string | null = null
  ): Promise<void> {
    const { data: existingProfile, error: selectError } = await this.supabaseService.client
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    if (selectError) {
      throw new Error('Failed to process account profile');
    }

    if (existingProfile) {
      const { error: updateError } = await this.supabaseService.client
        .from('profiles')
        .update({ role, full_name: fullName || null, contact_number: contactNumber })
        .eq('id', userId);

      if (updateError) {
        throw new Error('Failed to process account profile');
      }

      return;
    }

    const { error: insertError } = await this.supabaseService.client
      .from('profiles')
      .insert({
        id: userId,
        role,
        full_name: fullName || null,
        contact_number: contactNumber
      });

    if (insertError) {
      throw new Error('Failed to process account profile');
    }
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
          .upsert(
            {
              landlord_id: userId,
              type: document.type,
              file_url: storagePath,
              uploaded_at: new Date().toISOString()
            },
            {
              onConflict: 'landlord_id,type'
            }
          );

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

  private isExistingEmailSignupResponse(data: any): boolean {
    const user = data?.user;
    if (!user) return false;

    const identities = (user as any).identities;
    return Array.isArray(identities) && identities.length === 0;
  }

  toggleRegisterPasswordVisibility(): void {
    this.showRegisterPassword = !this.showRegisterPassword;
  }

  toggleRegisterConfirmPasswordVisibility(): void {
    this.showRegisterConfirmPassword = !this.showRegisterConfirmPassword;
  }

  private deriveDisplayNameFromEmail(email: string): string {
    const localPart = email.split('@')[0]?.trim() || 'User';
    return localPart
      .replace(/[._-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, (character) => character.toUpperCase());
  }

  @HostListener('window:scroll')
  onWindowScroll(): void {
    const currentScrollY = window.scrollY || 0;

    // Keep header visible near the top and avoid jitter from tiny scroll changes.
    if (currentScrollY <= 16) {
      this.isHeaderVisible = true;
      this.lastScrollY = currentScrollY;
      return;
    }

    const delta = currentScrollY - this.lastScrollY;
    if (Math.abs(delta) < this.scrollThreshold) {
      return;
    }

    this.isHeaderVisible = delta < 0;
    this.lastScrollY = currentScrollY;
  }
}