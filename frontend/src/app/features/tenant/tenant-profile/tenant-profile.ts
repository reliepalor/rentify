import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { SupabaseService } from '../../../core/services/supabase.service';
import { ModalService } from '../../../shared/services/modal.service';
import { TenantHeaderComponent } from '../../../shared/components/header/tenant-header.component';
import { TenantFooterComponent } from '../../../shared/components/footer/tenant-footer.component';
import { Profile } from '../../../shared/models/type';

interface TenantApplicationView {
  id: string;
  application_date: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  message: string | null;
  unit: {
    id: string;
    room_number: string;
    type: string;
    capacity: number;
    monthly_rent: number;
    status: string;
    property: {
      id: string;
      name: string;
      address: string | null;
      barangay: string | null;
      municipality: string | null;
      province: string | null;
      image_url: string | null;
    } | null;
  } | null;
}

interface RentalSchedule {
  unit_id: string;
  start_date: string | null;
  end_date: string | null;
  status: string;
}

@Component({
  selector: 'app-tenant-profile',
  standalone: true,
  imports: [CommonModule, RouterLink, TenantHeaderComponent, TenantFooterComponent],
  templateUrl: './tenant-profile.html'
})
export class TenantProfileComponent implements OnInit {
  loading = signal(true);
  profile = signal<Profile | null>(null);
  applications = signal<TenantApplicationView[]>([]);
  searchQuery = signal('');
  statusFilter = signal<'all' | 'pending' | 'approved' | 'rejected' | 'cancelled'>('all');
  rentalScheduleByUnit = signal<Record<string, RentalSchedule>>({});

  filteredApplications = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const status = this.statusFilter();

    return this.applications().filter((application) => {
      const matchesStatus = status === 'all' || application.status === status;

      if (!matchesStatus) {
        return false;
      }

      if (!query) {
        return true;
      }

      const propertyName = application.unit?.property?.name?.toLowerCase() || '';
      const roomNumber = application.unit?.room_number?.toLowerCase() || '';
      const location = this.getPropertyLocation(application).toLowerCase();

      return propertyName.includes(query) || roomNumber.includes(query) || location.includes(query);
    });
  });

  constructor(
    private supabaseService: SupabaseService,
    private modalService: ModalService,
    private router: Router
  ) {}

  async ngOnInit(): Promise<void> {
    await this.loadTenantProfilePage();
  }

  private async loadTenantProfilePage(): Promise<void> {
    this.loading.set(true);

    try {
      const user = await this.supabaseService.getCurrentUser();
      if (!user) {
        this.router.navigate(['/login']);
        return;
      }

      const tenantProfile = await this.supabaseService.getCurrentProfileStrict();
      if (!tenantProfile || tenantProfile.role !== 'tenant') {
        this.modalService.error('Access Denied', 'Only tenant accounts can access this profile page.');
        this.router.navigate(['/landing']);
        return;
      }

      this.profile.set(tenantProfile as Profile);

      const { data, error } = await this.supabaseService.client
        .from('tenant_applications')
        .select(`
          id,
          application_date,
          status,
          message,
          unit:units!unit_id(
            id,
            room_number,
            type,
            capacity,
            monthly_rent,
            status,
            property:properties!property_id(
              id,
              name,
              address,
              barangay,
              municipality,
              province,
              image_url
            )
          )
        `)
        .eq('tenant_id', user.id)
        .order('application_date', { ascending: false });

      if (error) {
        throw error;
      }

      const normalizedApplications = this.normalizeApplications(data || []);
      this.applications.set(normalizedApplications);
      await this.loadRentalSchedules(user.id, normalizedApplications);
    } catch {
      this.modalService.error('Load Failed', 'Unable to load your profile right now. Please try again.');
    } finally {
      this.loading.set(false);
    }
  }

  private async loadRentalSchedules(userId: string, applications: TenantApplicationView[]): Promise<void> {
    const unitIds = applications
      .map((application) => application.unit?.id)
      .filter((id): id is string => Boolean(id));

    if (!unitIds.length) {
      this.rentalScheduleByUnit.set({});
      return;
    }

    const { data, error } = await this.supabaseService.client
      .from('rentals')
      .select('unit_id, start_date, end_date, status, created_at')
      .eq('tenant_id', userId)
      .in('unit_id', unitIds)
      .order('created_at', { ascending: false });

    if (error) {
      this.rentalScheduleByUnit.set({});
      return;
    }

    const scheduleMap: Record<string, RentalSchedule> = {};
    (data || []).forEach((row: any) => {
      if (row?.unit_id && !scheduleMap[row.unit_id]) {
        scheduleMap[row.unit_id] = {
          unit_id: row.unit_id,
          start_date: row.start_date ?? null,
          end_date: row.end_date ?? null,
          status: row.status || 'active'
        };
      }
    });

    this.rentalScheduleByUnit.set(scheduleMap);
  }

  getRentalEndDate(application: TenantApplicationView): string | null {
    const unitId = application.unit?.id;
    if (!unitId) return null;

    return this.rentalScheduleByUnit()[unitId]?.end_date ?? null;
  }

  getRentalDuration(application: TenantApplicationView): string {
    const unitId = application.unit?.id;
    if (!unitId) return 'Not set by landlord';

    const rental = this.rentalScheduleByUnit()[unitId];
    if (!rental?.start_date || !rental?.end_date) {
      return 'Not set by landlord';
    }

    const startDate = new Date(rental.start_date);
    const endDate = new Date(rental.end_date);

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate < startDate) {
      return 'Invalid schedule';
    }

    const dayMs = 1000 * 60 * 60 * 24;
    const totalDays = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / dayMs));
    const months = Math.floor(totalDays / 30);
    const days = totalDays % 30;

    if (months > 0 && days > 0) {
      return `${months} month${months > 1 ? 's' : ''} ${days} day${days > 1 ? 's' : ''}`;
    }

    if (months > 0) {
      return `${months} month${months > 1 ? 's' : ''}`;
    }

    return `${days} day${days > 1 ? 's' : ''}`;
  }

  getTenantInitials(): string {
    const name = this.profile()?.full_name?.trim() || '';
    if (!name) return 'TN';

    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length === 1) {
      return parts[0].slice(0, 2).toUpperCase();
    }

    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  getPropertyLocation(application: TenantApplicationView): string {
    const property = application.unit?.property;
    if (!property) return 'Unknown location';

    return [property.barangay, property.municipality, property.province]
      .filter(Boolean)
      .join(', ') || 'Unknown location';
  }

  getStatusClasses(status: TenantApplicationView['status']): string {
    switch (status) {
      case 'approved':
        return 'bg-emerald-100 text-emerald-700';
      case 'pending':
        return 'bg-amber-100 text-amber-700';
      case 'rejected':
        return 'bg-rose-100 text-rose-700';
      case 'cancelled':
      default:
        return 'bg-stone-200 text-stone-700';
    }
  }

  getApprovedCount(): number {
    return this.applications().filter((item) => item.status === 'approved').length;
  }

  getPendingCount(): number {
    return this.applications().filter((item) => item.status === 'pending').length;
  }

  getDistinctPropertyCount(): number {
    const propertyIds = this.applications()
      .map((item) => item.unit?.property?.id)
      .filter((id): id is string => Boolean(id));

    return new Set(propertyIds).size;
  }

  setStatusFilter(status: 'all' | 'pending' | 'approved' | 'rejected' | 'cancelled'): void {
    this.statusFilter.set(status);
  }

  private normalizeApplications(rows: any[]): TenantApplicationView[] {
    return rows.map((row) => {
      const unitRaw = Array.isArray(row.unit) ? row.unit[0] : row.unit;
      const propertyRaw = unitRaw?.property
        ? (Array.isArray(unitRaw.property) ? unitRaw.property[0] : unitRaw.property)
        : null;

      return {
        id: row.id,
        application_date: row.application_date,
        status: row.status,
        message: row.message ?? null,
        unit: unitRaw
          ? {
              id: unitRaw.id,
              room_number: unitRaw.room_number,
              type: unitRaw.type,
              capacity: unitRaw.capacity,
              monthly_rent: unitRaw.monthly_rent,
              status: unitRaw.status,
              property: propertyRaw
                ? {
                    id: propertyRaw.id,
                    name: propertyRaw.name,
                    address: propertyRaw.address ?? null,
                    barangay: propertyRaw.barangay ?? null,
                    municipality: propertyRaw.municipality ?? null,
                    province: propertyRaw.province ?? null,
                    image_url: propertyRaw.image_url ?? null
                  }
                : null
            }
          : null
      } as TenantApplicationView;
    });
  }
}
