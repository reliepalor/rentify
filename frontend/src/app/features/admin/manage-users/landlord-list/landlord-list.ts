import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  LandlordRecord,
  LandlordPropertyUnitRow,
  LandlordService,
  LandlordVerificationStatus,
  PendingLandlordsFilter
} from '../../../../core/services/landlord.service';
import { ToastService } from '../../../../shared/services/toast.service';
import { ModalService } from '../../../../shared/services/modal.service';

@Component({
  selector: 'app-landlord-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './landlord-list.html'
})
export class LandlordListComponent implements OnInit, OnDestroy {
  landlords = signal<LandlordRecord[]>([]);
  loading = signal(false);

  searchTerm = '';
  selectedStatus: 'all' | LandlordVerificationStatus = 'all';
  submittedFrom = '';
  submittedTo = '';

  private queueSubscription: { unsubscribe: () => void } | null = null;

  constructor(
    private readonly landlordService: LandlordService,
    private readonly toastService: ToastService,
    private readonly modalService: ModalService,
    private readonly router: Router
  ) {}

  async ngOnInit(): Promise<void> {
    await this.loadLandlords();

    this.queueSubscription = this.landlordService.watchLandlordQueue(() => {
      void this.loadLandlords(false);
    });
  }

  ngOnDestroy(): void {
    this.queueSubscription?.unsubscribe();
  }

  async applyFilters(): Promise<void> {
    await this.loadLandlords();
  }

  async onStatusChange(): Promise<void> {
    await this.loadLandlords();
  }

  async clearFilters(): Promise<void> {
    this.searchTerm = '';
    this.selectedStatus = 'all';
    this.submittedFrom = '';
    this.submittedTo = '';
    await this.loadLandlords();
  }

  trackByLandlordId(_: number, landlord: LandlordRecord): string {
    return landlord.id;
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

  formatDate(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'N/A';

    return new Intl.DateTimeFormat('en-PH', {
      month: 'short',
      day: '2-digit',
      year: 'numeric'
    }).format(date);
  }

  async openLandlordRecord(landlord: LandlordRecord): Promise<void> {
    if (landlord.status !== 'approved') {
      await this.router.navigate(['/admin/users', landlord.id]);
      return;
    }

    try {
      const rows = await this.landlordService.getLandlordPropertyUnits(landlord.id);
      this.openApprovedLandlordUnitsModal(landlord, rows);
    } catch (error) {
      console.error('Failed to load landlord properties and units:', error);
      this.toastService.error('Unable to load landlord properties and units.');
    }
  }

  getActionLabel(landlord: LandlordRecord): string {
    return landlord.status === 'approved' ? 'View Properties' : 'Review';
  }

  private openApprovedLandlordUnitsModal(
    landlord: LandlordRecord,
    rows: LandlordPropertyUnitRow[]
  ): void {
    this.modalService.open({
      type: 'info',
      title: `${landlord.full_name} - Properties and Units`,
      message: 'Listed properties and units for this approved landlord.',
      table: {
        columns: [
          { key: 'propertyName', label: 'Property' },
          { key: 'location', label: 'Location' },
          { key: 'unitRoom', label: 'Unit' },
          { key: 'unitType', label: 'Type' },
          { key: 'monthlyRent', label: 'Monthly Rent' },
          { key: 'unitStatus', label: 'Status' }
        ],
        rows: rows as unknown as Record<string, unknown>[],
        emptyMessage: 'This landlord has no properties or units listed yet.'
      }
    });
  }

  private async loadLandlords(showErrorToast = true): Promise<void> {
    this.loading.set(true);

    const filter: PendingLandlordsFilter = {
      search: this.searchTerm,
      status: this.selectedStatus,
      submittedFrom: this.submittedFrom,
      submittedTo: this.submittedTo
    };

    try {
      const data = await this.landlordService.getPendingLandlords(filter);
      this.landlords.set(data);
    } catch (error) {
      console.error('Failed to load landlord verification queue:', error);

      if (showErrorToast) {
        this.toastService.error('Failed to load pending landlords.');
      }
    } finally {
      this.loading.set(false);
    }
  }
}
