import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../../../core/services/supabase.service';
import { ToastService } from '../../../shared/services/toast.service';

@Component({
  selector: 'app-landlord-rentals',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './landlord-rentals.html'
})
export class LandlordRentalsComponent implements OnInit, OnDestroy {

  rentals = signal<any[]>([]);
  loading = signal(true);
  now = signal(new Date());
  endDateDrafts = signal<Record<string, string>>({});
  searchQuery = signal('');
  statusFilter = signal<'all' | 'active' | 'ended' | 'terminated'>('all');
  sortBy = signal<'newest' | 'oldest' | 'rent-high' | 'rent-low'>('newest');
  quickFilter = signal<'all' | 'active-only' | 'ending-soon' | 'high-rent' | 'recently-started'>('all');
  private nowTimer: ReturnType<typeof setInterval> | null = null;
  private readonly pesoFormatter = new Intl.NumberFormat('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  filteredRentals = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const status = this.statusFilter();
    const sort = this.sortBy();

    let list = [...this.rentals()];

    if (status !== 'all') {
      list = list.filter(rental => rental.status === status);
    }

    const quick = this.quickFilter();
    if (quick === 'active-only') {
      list = list.filter(rental => rental.status === 'active');
    } else if (quick === 'ending-soon') {
      list = list.filter(rental => this.isEndingSoon(rental.end_date));
    } else if (quick === 'high-rent') {
      list = list.filter(rental => Number(rental.monthly_rent || 0) >= 10000);
    } else if (quick === 'recently-started') {
      list = list.filter(rental => this.isRecentStart(rental.start_date));
    }

    if (query) {
      list = list.filter(rental => {
        const tenantName = rental.tenant?.full_name?.toLowerCase() || '';
        const contact = rental.tenant?.contact_number?.toLowerCase() || '';
        const propertyName = rental.unit?.property?.name?.toLowerCase() || '';
        const roomNumber = String(rental.unit?.room_number || '').toLowerCase();
        const unitType = rental.unit?.type?.toLowerCase() || '';

        return [tenantName, contact, propertyName, roomNumber, unitType].some(value => value.includes(query));
      });
    }

    if (sort === 'newest') {
      list.sort((a, b) => this.parseDateValue(b.start_date).getTime() - this.parseDateValue(a.start_date).getTime());
    } else if (sort === 'oldest') {
      list.sort((a, b) => this.parseDateValue(a.start_date).getTime() - this.parseDateValue(b.start_date).getTime());
    } else if (sort === 'rent-high') {
      list.sort((a, b) => Number(b.monthly_rent || 0) - Number(a.monthly_rent || 0));
    } else if (sort === 'rent-low') {
      list.sort((a, b) => Number(a.monthly_rent || 0) - Number(b.monthly_rent || 0));
    }

    return list;
  });

  totalMonthlyIncome = computed(() =>
    this.rentals()
      .filter(rental => rental.status === 'active')
      .reduce((sum, rental) => sum + Number(rental.monthly_rent || 0), 0)
  );

  activeCount = computed(() => this.rentals().filter(rental => rental.status === 'active').length);
  endingSoonCount = computed(() => this.rentals().filter(rental => this.isEndingSoon(rental.end_date)).length);
  highRentCount = computed(() => this.rentals().filter(rental => Number(rental.monthly_rent || 0) >= 10000).length);
  recentStartCount = computed(() => this.rentals().filter(rental => this.isRecentStart(rental.start_date)).length);

  constructor(
    private supabaseService: SupabaseService,
    private toastService: ToastService
  ) {}

  async ngOnInit() {
    this.startClock();
    await this.loadRentals();
  }

  ngOnDestroy(): void {
    if (this.nowTimer) {
      clearInterval(this.nowTimer);
      this.nowTimer = null;
    }
  }

  async loadRentals() {
    this.loading.set(true);
    try {
      const user = await this.supabaseService.getCurrentUser();
      if (!user) return;

      const { data, error } = await this.supabaseService.client
        .from('rentals')
        .select(`
          *,
          tenant:tenant_id (full_name, contact_number),
          unit:unit_id (
            room_number, 
            type, 
            monthly_rent,
            property:property_id (name)
          )
        `)
        .eq('unit.property.landlord_id', user.id)
        .order('start_date', { ascending: false });

      if (error) throw error;
      this.rentals.set(data || []);
      this.syncEndDateDrafts(data || []);
    } catch (error) {
      console.error('Error loading rentals:', error);
      this.toastService.error('Failed to load rentals');
    } finally {
      this.loading.set(false);
    }
  }

  async saveRentalEndDate(rentalId: string): Promise<void> {
    const endDate = this.endDateDrafts()[rentalId]?.trim() || null;

    try {
      const { error } = await this.supabaseService.client.rpc('update_rental_end_date', {
        p_rental_id: rentalId,
        p_end_date: endDate
      });

      if (error) throw error;

      this.toastService.success('End date updated successfully');
      await this.loadRentals();
    } catch (error) {
      console.error('Error updating rental end date:', error);
      this.toastService.error('Failed to update end date');
    }
  }

  async endRental(rentalId: string) {
    if (!confirm('End this rental?')) return;

    try {
      const { error } = await this.supabaseService.client.rpc('end_rental', {
        p_rental_id: rentalId
      });

      if (error) throw error;

      this.toastService.success('Rental ended successfully');
      await this.loadRentals();
    } catch (error) {
      this.toastService.error('Failed to end rental');
    }
  }

  updateEndDateDraft(rentalId: string, value: string): void {
    this.endDateDrafts.update(drafts => ({
      ...drafts,
      [rentalId]: value
    }));
  }

  getEndDateDraft(rentalId: string, fallback: string | null | undefined): string {
    return this.endDateDrafts()[rentalId] ?? this.toDateInputValue(fallback);
  }

  updateSearch(query: string): void {
    this.searchQuery.set(query);
  }

  updateStatusFilter(value: string): void {
    if (value === 'active' || value === 'ended' || value === 'terminated' || value === 'all') {
      this.statusFilter.set(value);
    }
  }

  updateSortBy(value: string): void {
    if (value === 'newest' || value === 'oldest' || value === 'rent-high' || value === 'rent-low') {
      this.sortBy.set(value);
    }
  }

  applyQuickFilter(filter: 'all' | 'active-only' | 'ending-soon' | 'high-rent' | 'recently-started'): void {
    this.quickFilter.set(filter);
  }

  clearAllFilters(): void {
    this.searchQuery.set('');
    this.statusFilter.set('all');
    this.sortBy.set('newest');
    this.quickFilter.set('all');
  }

  formatMoney(value: number | string | null | undefined): string {
    if (value === null || value === undefined || value === '') return 'Not set';
    const numericValue = Number(value);
    if (Number.isNaN(numericValue)) return 'Not set';
    return `PHP ${this.pesoFormatter.format(numericValue)}`;
  }

  formatDate(value: string | null | undefined, options?: Intl.DateTimeFormatOptions): string {
    if (!value) return 'Not set';
    const date = this.parseDateValue(value);
    if (Number.isNaN(date.getTime())) return 'Not set';

    return new Intl.DateTimeFormat('en-PH', options ?? {
      year: 'numeric',
      month: 'short',
      day: '2-digit'
    }).format(date);
  }

  getStatusClass(status: string | null | undefined): string {
    if (status === 'active') return 'bg-emerald-100 text-emerald-700';
    if (status === 'ended') return 'bg-slate-200 text-slate-700';
    if (status === 'terminated') return 'bg-rose-100 text-rose-700';
    return 'bg-amber-100 text-amber-700';
  }

  getRentalDurationLabel(rental: { start_date: string | null | undefined; end_date: string | null | undefined; status: string | null | undefined }): string {
    if (rental.status === 'active') {
      const daysLeft = this.getDaysUntil(rental.end_date);
      if (daysLeft === null) return 'No end date set';
      if (daysLeft > 0) return `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`;
      if (daysLeft === 0) return 'Ends today';
      return `Overdue by ${Math.abs(daysLeft)} day${Math.abs(daysLeft) === 1 ? '' : 's'}`;
    }

    const start = this.parseDateValue(rental.start_date);
    const end = this.parseDateValue(rental.end_date);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 'N/A';

    const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000));
    if (days < 30) return `${days} day${days === 1 ? '' : 's'}`;

    const months = Math.max(1, Math.round(days / 30));
    return `${months} month${months === 1 ? '' : 's'}`;
  }

  isEndingSoon(endDate: string | null | undefined): boolean {
    if (!endDate) return false;
    const end = this.parseDateValue(endDate);
    if (Number.isNaN(end.getTime())) return false;

    const days = this.getDaysUntil(endDate);
    if (days === null) return false;
    return days >= 0 && days <= 30;
  }

  isRecentStart(startDate: string | null | undefined): boolean {
    if (!startDate) return false;
    const start = this.parseDateValue(startDate);
    if (Number.isNaN(start.getTime())) return false;

    const days = this.getDaysSince(startDate);
    if (days === null) return false;
    return days >= 0 && days <= 30;
  }

  private startClock(): void {
    this.now.set(new Date());
    this.nowTimer = setInterval(() => {
      this.now.set(new Date());
    }, 60000);
  }

  private syncEndDateDrafts(rentals: any[]): void {
    const drafts = rentals.reduce((accumulator, rental) => {
      accumulator[rental.id] = this.toDateInputValue(rental.end_date);
      return accumulator;
    }, {} as Record<string, string>);

    this.endDateDrafts.set(drafts);
  }

  private parseDateValue(value: string | null | undefined): Date {
    if (!value) return new Date(NaN);
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return new Date(`${value}T00:00:00`);
    }

    return new Date(value);
  }

  private toDateInputValue(value: string | null | undefined): string {
    if (!value) return '';
    return value.slice(0, 10);
  }

  private getDaysUntil(endDate: string | null | undefined): number | null {
    if (!endDate) return null;

    const end = this.parseDateValue(endDate);
    if (Number.isNaN(end.getTime())) return null;

    const today = this.getTodayAsDate();
    return Math.round((end.getTime() - today.getTime()) / 86400000);
  }

  private getDaysSince(startDate: string | null | undefined): number | null {
    if (!startDate) return null;

    const start = this.parseDateValue(startDate);
    if (Number.isNaN(start.getTime())) return null;

    const today = this.getTodayAsDate();
    return Math.round((today.getTime() - start.getTime()) / 86400000);
  }

  private getTodayAsDate(): Date {
    const now = this.now();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
}