import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SupabaseService } from '../../../core/services/supabase.service';
import { LoadingService } from '../../services/loading.service';
import { ModalService } from '../../services/modal.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, FormsModule],
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

  loginEmail = '';
  loginPassword = '';

  registerEmail = '';
  registerPassword = '';
  registerConfirmPassword = '';
  showRegisterPassword = false;
  showRegisterConfirmPassword = false;
  selectedRole: 'tenant' | 'landlord' = 'tenant';

  authLoading = false;
  private isHandlingOAuthCallback = false;

  private lastScrollY = 0;
  private readonly scrollThreshold = 8;
  private readonly authPanelAnimationMs = 320;
  private readonly oauthCallbackParam = 'auth_callback';
  private authStateSubscription?: { unsubscribe: () => void };

  menuItems = [
    { label: 'Home', href: '#inicio', active: true },
    { label: 'Rooms', href: '#acomodacoes', active: false },
    { label: 'About', href: '#sobre', active: false },
    { label: 'Contact', href: '#contato', active: false }
  ];

  constructor(
    private supabaseService: SupabaseService,
    private router: Router,
    private loadingService: LoadingService,
    private modalService: ModalService,
    private toastService: ToastService
  ) {}

  ngOnInit(): void {
    this.lastScrollY = window.scrollY || 0;

    // Defer async auth mutations to the next macrotask to avoid NG0100 in dev mode.
    window.setTimeout(() => {
      void this.handleOAuthReturnInPlace();
    }, 0);

    const { data } = this.supabaseService.client.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        window.setTimeout(() => {
          void this.handleOAuthReturnInPlace();
        }, 0);
      }
    });

    this.authStateSubscription = data.subscription;
  }

  ngOnDestroy(): void {
    this.authStateSubscription?.unsubscribe();
    document.body.style.overflow = '';
  }

  onMenuClick(index: number) {
    this.menuItems.forEach((item, i) => {
      item.active = i === index;
    });
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

      this.toastService.success('Login successful');
      this.closeAuthPanel();
      this.navigateByRole(profile.role as string);
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
      const derivedFullName = this.deriveDisplayNameFromEmail(this.registerEmail);

      let { data, error } = await this.supabaseService.client.auth.signUp({
        email: this.registerEmail.trim().toLowerCase(),
        password: this.registerPassword,
        options: {
          data: {
            full_name: derivedFullName,
            role: this.selectedRole
          }
        }
      });

      if (error) {
        const retry = await this.supabaseService.client.auth.signUp({
          email: this.registerEmail.trim().toLowerCase(),
          password: this.registerPassword
        });
        data = retry.data;
        error = retry.error;
      }

      // Supabase can obfuscate existing-email signups by returning a user with empty identities and no explicit error.
      if (!error && this.isExistingEmailSignupResponse(data)) {
        this.modalService.info('Account Already Exists', 'This email is already registered. Please sign in instead.');
        return;
      }

      if (error) throw error;

      if (data?.session && data.user?.id) {
        try {
          await this.ensureProfileExists(data.user.id, this.selectedRole, derivedFullName);
        } catch {
          // Allow successful auth registration even if profile sync is delayed.
        }
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
        const roleFromStorage = (sessionStorage.getItem('selected_role') as 'tenant' | 'landlord' | null) || 'tenant';
        const normalizedRole = roleFromStorage === 'landlord' ? 'landlord' : 'tenant';

        const { error: metadataError } = await this.supabaseService.client.auth.updateUser({
          data: {
            role: normalizedRole,
            full_name: user.user_metadata?.['full_name'] || null
          }
        });

        if (metadataError) {
          throw metadataError;
        }

        await this.ensureProfileExists(
          user.id,
          normalizedRole,
          user.user_metadata?.['full_name'] || this.deriveDisplayNameFromEmail(user.email || '')
        );
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

      this.toastService.success(authIntent === 'register' ? 'Registration complete' : 'Login successful');
      this.closeAuthPanel();
      this.navigateByRole(profile.role as string);
    } catch {
      this.modalService.error('Authentication Failed', 'Unable to complete Google sign in. Please try again.');
    } finally {
      sessionStorage.removeItem('auth_intent');
      sessionStorage.removeItem('selected_role');
      this.cleanupOAuthCallbackParam();
      this.loadingService.hide();
      this.authLoading = false;
      this.isHandlingOAuthCallback = false;
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
        this.router.navigate(['/tenant']);
        break;
      default:
        this.router.navigate(['/landing']);
        break;
    }
  }

  private async ensureProfileExists(
    userId: string,
    role: 'tenant' | 'landlord',
    fullName: string
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
        .update({ role, full_name: fullName || null })
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
        full_name: fullName || null
      });

    if (insertError) {
      throw new Error('Failed to process account profile');
    }
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