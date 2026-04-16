import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SupabaseService } from '../../../core/services/supabase.service';
import { TenantHeaderComponent } from '../../../shared/components/header/tenant-header.component';
import { TenantFooterComponent } from '../../../shared/components/footer/tenant-footer.component';
import { Property, Unit } from '../../../shared/models/type';
import { ModalService } from '../../../shared/services/modal.service';

@Component({
  selector: 'app-tenant-property-details',
  standalone: true,
  imports: [CommonModule, RouterLink, TenantHeaderComponent, TenantFooterComponent],
  templateUrl: './tenant-property-details.html'
})
export class TenantPropertyDetailsComponent implements OnInit {
  property = signal<Property | null>(null);
  units = signal<Unit[]>([]);
  loading = signal(true);
  notFound = signal(false);
  applyingUnitId = signal<string | null>(null);
  appliedUnitIds = signal<string[]>([]);

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private supabaseService: SupabaseService,
    private modalService: ModalService
  ) {}

  async ngOnInit(): Promise<void> {
    const propertyId = this.route.snapshot.paramMap.get('id');

    if (!propertyId) {
      this.loading.set(false);
      this.notFound.set(true);
      return;
    }

    await this.loadPropertyDetails(propertyId);
  }

  private async loadPropertyDetails(propertyId: string): Promise<void> {
    this.loading.set(true);
    this.notFound.set(false);

    try {
      const { data, error } = await this.supabaseService.client
        .from('properties')
        .select('*, units(*)')
        .eq('id', propertyId)
        .eq('approval_status', 'approved')
        .eq('status', 'active')
        .single();

      if (error || !data) {
        this.notFound.set(true);
        this.property.set(null);
        this.units.set([]);
        return;
      }

      const typedProperty = data as Property;
      const approvedUnits = ((typedProperty.units || []) as Unit[])
        .filter((unit) => unit.approval_status === 'approved')
        .sort((a, b) => a.monthly_rent - b.monthly_rent);

      this.property.set(typedProperty);
      this.units.set(approvedUnits);
      await this.loadAppliedUnits(approvedUnits);
    } catch {
      this.notFound.set(true);
      this.property.set(null);
      this.units.set([]);
      this.appliedUnitIds.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  private async loadAppliedUnits(units: Unit[]): Promise<void> {
    if (!units.length) {
      this.appliedUnitIds.set([]);
      return;
    }

    const {
      data: { user }
    } = await this.supabaseService.client.auth.getUser();

    if (!user) {
      this.appliedUnitIds.set([]);
      return;
    }

    const unitIds = units.map((unit) => unit.id);

    const { data, error } = await this.supabaseService.client
      .from('tenant_applications')
      .select('unit_id')
      .eq('tenant_id', user.id)
      .in('unit_id', unitIds)
      .in('status', ['pending', 'approved']);

    if (error) {
      this.appliedUnitIds.set([]);
      return;
    }

    const appliedIds = (data || []).map((item: { unit_id: string }) => item.unit_id);
    this.appliedUnitIds.set(appliedIds);
  }

  isUnitAlreadyApplied(unitId: string): boolean {
    return this.appliedUnitIds().includes(unitId);
  }

  getApplyButtonText(unit: Unit): string {
    if (this.applyingUnitId() === unit.id) {
      return 'Submitting Application...';
    }

    if (this.isUnitAlreadyApplied(unit.id)) {
      return 'Application Sent';
    }

    return 'Apply for Unit';
  }

  getPropertyLocation(property: Property): string {
    return [property.barangay, property.municipality, property.province]
      .filter(Boolean)
      .join(', ') || 'Location unknown';
  }

  formatAmenities(amenities: unknown): string[] {
    if (!amenities) return [];
    if (Array.isArray(amenities)) return amenities;
    if (typeof amenities === 'string') {
      return amenities
        .split(/,|\n/)
        .map((item) => item.trim())
        .filter(Boolean);
    }
    return [];
  }

  getMinUnitPrice(): number {
    if (!this.units().length) return 0;
    return Math.min(...this.units().map((unit) => unit.monthly_rent));
  }

  backToListings(): void {
    this.router.navigate(['/tenant-landing']);
  }

  async applyForUnit(unit: Unit): Promise<void> {
    if (this.applyingUnitId()) {
      return;
    }

    if (this.isUnitAlreadyApplied(unit.id)) {
      this.modalService.info('Already Applied', `You already have an active application for Room ${unit.room_number}.`);
      return;
    }

    if (unit.status !== 'available') {
      this.modalService.info('Unit Unavailable', 'This unit is not available for applications right now.');
      return;
    }

    this.applyingUnitId.set(unit.id);

    try {
      const {
        data: { user }
      } = await this.supabaseService.client.auth.getUser();

      if (!user) {
        this.modalService.info('Login Required', 'Please sign in as a tenant first before applying for a unit.');
        return;
      }

      const profile = await this.supabaseService.getCurrentProfileStrict();
      if (!profile || profile.role !== 'tenant') {
        this.modalService.error('Access Denied', 'Only tenant accounts can apply for units.');
        return;
      }

      const { data: existingApplication, error: existingError } = await this.supabaseService.client
        .from('tenant_applications')
        .select('id, status')
        .eq('tenant_id', user.id)
        .eq('unit_id', unit.id)
        .in('status', ['pending', 'approved'])
        .maybeSingle();

      if (existingError) {
        throw existingError;
      }

      if (existingApplication) {
        const statusLabel = existingApplication.status === 'approved' ? 'approved' : 'pending';
        this.modalService.info('Already Applied', `You already have a ${statusLabel} application for Room ${unit.room_number}.`);
        this.appliedUnitIds.update((ids) => (ids.includes(unit.id) ? ids : [...ids, unit.id]));
        return;
      }

      const { error: insertError } = await this.supabaseService.client
        .from('tenant_applications')
        .insert({
          tenant_id: user.id,
          unit_id: unit.id,
          status: 'pending',
          message: `Interested in Room ${unit.room_number}.`
        });

      if (insertError) {
        throw insertError;
      }

      this.modalService.success(
        'Application Submitted',
        `You successfully applied for Room ${unit.room_number}. The landlord will review your application soon.`
      );
      this.appliedUnitIds.update((ids) => (ids.includes(unit.id) ? ids : [...ids, unit.id]));
    } catch {
      this.modalService.error('Application Failed', 'Unable to submit your application right now. Please try again.');
    } finally {
      this.applyingUnitId.set(null);
    }
  }
}