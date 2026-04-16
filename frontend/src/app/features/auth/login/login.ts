import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { SupabaseService } from '../../../core/services/supabase.service';
import { LandlordService } from '../../../core/services/landlord.service';
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
  private readonly landlordDraftKey = 'register_landlord_draft';
  private readonly landlordReviewWaitKey = 'landlord_review_wait';

  constructor(
    private supabaseService: SupabaseService,
    private landlordService: LandlordService,
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
            await this.syncPendingLandlordVerification(profile.id);
            await this.routeLandlordByVerification(profile.id);
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

      const roleToCheck = (profile.role as string).toLowerCase().trim();

      if (roleToCheck === 'landlord') {
        await this.syncPendingLandlordVerification(profile.id);
        const canAccessLandlord = await this.routeLandlordByVerification(profile.id);
        if (canAccessLandlord) {
          this.toastService.success('Login successful');
        }
        return;
      }

      this.toastService.success('Login successful');
      
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

  private async syncPendingLandlordVerification(userId: string): Promise<void> {
    const rawDraft = sessionStorage.getItem(this.landlordDraftKey);
    if (!rawDraft) return;

    try {
      const draft = JSON.parse(rawDraft) as {
        full_name: string;
        contact_number: string;
        documents: Record<string, { fileName: string; mimeType: string; dataUrl: string }>;
      };

      const documents = [
        { type: 'business_permit', file: draft.documents['business_permit'] },
        { type: 'barangay_clearance', file: draft.documents['barangay_clearance'] },
        { type: 'valid_id', file: draft.documents['valid_id'] }
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

      sessionStorage.removeItem(this.landlordDraftKey);
    } catch (error) {
      console.warn('Unable to sync pending landlord documents during login.', error);
    }
  }

  private async routeLandlordByVerification(userId: string): Promise<boolean> {
    const summary = await this.landlordService.getLandlordVerificationSummary(userId);

    if (!summary || summary.status === 'pending' || summary.status === 'resubmission_required') {
      const message = 'Thanks for signing up! Your landlord account is still under review. Please try logging in again once the admin approves your account.';
      sessionStorage.setItem(this.landlordReviewWaitKey, message);
      this.modalService.info('Account Not Yet Approved', message);
      await this.router.navigate(['/landing']);
      return false;
    }

    if (summary.status === 'rejected') {
      const message = 'Your landlord verification was rejected. Please check your email for the admin remarks and next steps.';
      sessionStorage.setItem(this.landlordReviewWaitKey, message);
      this.modalService.error('Verification Rejected', 'Your landlord verification was rejected. Please check your email for the admin remarks and next steps.');
      await this.router.navigate(['/landing']);
      return false;
    }

    await this.router.navigate(['/landlord']);
    return true;
  }

  private async dataUrlToBlob(dataUrl: string): Promise<Blob> {
    const response = await fetch(dataUrl);
    return response.blob();
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