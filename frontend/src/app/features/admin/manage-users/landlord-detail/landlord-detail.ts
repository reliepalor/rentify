import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  AdminVerificationAction,
  LandlordDocument,
  LandlordReviewDetails,
  LandlordService,
  LandlordVerificationStatus
} from '../../../../core/services/landlord.service';
import { ToastService } from '../../../../shared/services/toast.service';
import { ModalService } from '../../../../shared/services/modal.service';

interface ReviewDialogState {
  open: boolean;
  action: AdminVerificationAction | null;
}

@Component({
  selector: 'app-landlord-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './landlord-detail.html'
})
export class LandlordDetailComponent implements OnInit {
  details = signal<LandlordReviewDetails | null>(null);
  loading = signal(true);
  processing = signal(false);
  documentUrls = signal<Record<string, string>>({});

  dialog = signal<ReviewDialogState>({ open: false, action: null });
  remarks = '';

  private landlordId = '';

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly landlordService: LandlordService,
    private readonly toastService: ToastService,
    private readonly modalService: ModalService
  ) {}

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');

    if (!id) {
      this.toastService.error('Invalid landlord ID.');
      await this.router.navigate(['/admin/users']);
      return;
    }

    this.landlordId = id;
    await this.loadDetails();
  }

  getStatusClass(status: LandlordVerificationStatus): string {
    if (status === 'pending') return 'bg-amber-100 text-amber-800';
    if (status === 'resubmission_required') return 'bg-orange-100 text-orange-800';
    if (status === 'approved') return 'bg-emerald-100 text-emerald-800';
    return 'bg-rose-100 text-rose-800';
  }

  formatStatus(status: LandlordVerificationStatus): string {
    return status.replace(/_/g, ' ');
  }

  formatDate(value: string | null | undefined): string {
    if (!value) return 'N/A';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'N/A';

    return new Intl.DateTimeFormat('en-PH', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  }

  getDocumentLabel(type: LandlordDocument['type']): string {
    if (type === 'business_permit') return 'Business Permit';
    if (type === 'barangay_clearance') return 'Barangay Clearance';
    return 'Valid ID';
  }

  getActionLabel(action: AdminVerificationAction): string {
    if (action === 'approved') return 'Approve';
    if (action === 'rejected') return 'Reject';
    return 'Request Resubmission';
  }

  openDialog(action: AdminVerificationAction): void {
    this.remarks = '';
    this.dialog.set({ open: true, action });
  }

  closeDialog(): void {
    this.dialog.set({ open: false, action: null });
    this.remarks = '';
  }

  isPdf(url: string): boolean {
    return url.toLowerCase().includes('.pdf');
  }

  getDocumentUrl(document: LandlordDocument): string {
    return this.documentUrls()[document.id] || '';
  }

  async submitAction(): Promise<void> {
    const action = this.dialog().action;
    if (!action) return;

    if (action !== 'approved' && !this.remarks.trim()) {
      this.modalService.info('Remarks Required', 'Please provide remarks before continuing.');
      return;
    }

    this.processing.set(true);

    try {
      if (action === 'approved') {
        await this.landlordService.approveLandlord(this.landlordId);
        this.toastService.success('Landlord approved successfully.');
      } else if (action === 'rejected') {
        await this.landlordService.rejectLandlord(this.landlordId, this.remarks);
        this.toastService.success('Landlord was rejected.');
      } else {
        await this.landlordService.requestResubmission(this.landlordId, this.remarks);
        this.toastService.success('Resubmission request sent.');
      }

      this.closeDialog();
      await this.loadDetails();
    } catch (error: any) {
      const message = typeof error?.message === 'string' ? error.message : 'Action failed. Please try again.';
      this.modalService.error('Verification Action Failed', message);
      console.error('Verification action failed:', error);
    } finally {
      this.processing.set(false);
    }
  }

  canTakeAction(): boolean {
    const status = this.details()?.landlord.status;
    return status === 'pending';
  }

  private async loadDetails(): Promise<void> {
    this.loading.set(true);

    try {
      const details = await this.landlordService.getLandlordById(this.landlordId);
      this.details.set(details);
      await this.loadDocumentUrls(details.documents);
    } catch (error) {
      console.error('Failed to load landlord details:', error);
      this.toastService.error('Unable to load landlord details.');
      await this.router.navigate(['/admin/users']);
    } finally {
      this.loading.set(false);
    }
  }

  private async loadDocumentUrls(documents: LandlordDocument[]): Promise<void> {
    const nextUrls: Record<string, string> = {};

    await Promise.all(
      documents.map(async (document) => {
        try {
          nextUrls[document.id] = await this.landlordService.getSignedDocumentUrl(document.file_url);
        } catch {
          nextUrls[document.id] = '';
        }
      })
    );

    this.documentUrls.set(nextUrls);
  }
}
