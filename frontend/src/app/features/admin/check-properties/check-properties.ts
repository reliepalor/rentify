import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../../../core/services/supabase.service';
import { ToastService } from '../../../shared/services/toast.service';

interface PendingPropertyRow {
  id: string;
  name: string;
  address?: string | null;
  barangay: string | null;
  municipality: string | null;
  province: string | null;
  description?: string | null;
  image_url?: string | null;
  amenities?: unknown;
  house_rules?: string | null;
  created_at: string;
  status: string;
  approval_status?: 'pending' | 'approved' | 'rejected';
  approval_remarks?: string | null;
  landlord: {
    full_name: string | null;
    contact_number: string | null;
  } | null;
}

interface PendingUnitRow {
  id: string;
  room_number: string;
  type: string;
  capacity: number;
  monthly_rent: number;
  created_at: string;
  status?: string;
  approval_status?: 'pending' | 'approved' | 'rejected';
  approval_remarks?: string | null;
  property: {
    id: string;
    name: string;
    landlord: {
      full_name: string | null;
      contact_number: string | null;
    } | null;
  } | null;
}

interface PropertyDraftDetail extends PendingPropertyRow {
  units: PendingUnitRow[];
}

@Component({
  selector: 'app-check-properties',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './check-properties.html'
})
export class CheckPropertiesComponent implements OnInit {
  loading = signal(false);
  detailLoading = signal(false);
  propertyRecords = signal<PendingPropertyRow[]>([]);
  unitRecords = signal<PendingUnitRow[]>([]);
  activeTab = signal<'properties' | 'units'>('properties');
  selectedPropertyStatus = signal<'all' | 'pending' | 'approved' | 'rejected'>('all');
  selectedUnitStatus = signal<'all' | 'pending' | 'approved' | 'rejected'>('all');
  propertySearchQuery = signal('');
  unitSearchQuery = signal('');
  selectedPropertyLocation = signal<string>('');
  selectedUnitLocation = signal<string>('');
  showPropertyDetailModal = signal(false);
  selectedPropertyDetail = signal<PropertyDraftDetail | null>(null);
  filteredProperties = computed(() => {
    const selectedStatus = this.selectedPropertyStatus();
    const searchQuery = this.propertySearchQuery().toLowerCase();
    const selectedLocation = this.selectedPropertyLocation();
    let records = this.propertyRecords();

    // Filter by status
    if (selectedStatus !== 'all') {
      records = records.filter((record) => (record.approval_status || 'pending') === selectedStatus);
    }

    // Filter by search query (name, landlord)
    if (searchQuery) {
      records = records.filter((record) => {
        const matchesName = record.name.toLowerCase().includes(searchQuery);
        const matchesLandlord = record.landlord?.full_name?.toLowerCase().includes(searchQuery) || false;
        return matchesName || matchesLandlord;
      });
    }

    // Filter by location
    if (selectedLocation) {
      records = records.filter((record) => {
        const location = this.formatPropertyLocation(record);
        return location.toLowerCase().includes(selectedLocation.toLowerCase());
      });
    }

    return records;
  });
  filteredUnits = computed(() => {
    const selectedStatus = this.selectedUnitStatus();
    const searchQuery = this.unitSearchQuery().toLowerCase();
    const selectedLocation = this.selectedUnitLocation();
    let records = this.unitRecords();

    // Filter by status
    if (selectedStatus !== 'all') {
      records = records.filter((record) => (record.approval_status || 'pending') === selectedStatus);
    }

    // Filter by search query (room number, property name, landlord)
    if (searchQuery) {
      records = records.filter((record) => {
        const matchesRoom = record.room_number.toLowerCase().includes(searchQuery);
        const matchesProperty = record.property?.name.toLowerCase().includes(searchQuery) || false;
        const matchesLandlord = record.property?.landlord?.full_name?.toLowerCase().includes(searchQuery) || false;
        return matchesRoom || matchesProperty || matchesLandlord;
      });
    }

    // Filter by location
    if (selectedLocation) {
      records = records.filter((record) => {
        if (!record.property) return false;
        const property = record.property as any;
        const location = [property.barangay, property.municipality, property.province]
          .filter((v): v is string => Boolean(v && v.trim()))
          .join(', ')
          .toLowerCase();
        return location.includes(selectedLocation.toLowerCase());
      });
    }

    return records;
  });

  uniquePropertyLocations = computed(() => {
    const locations = new Set<string>();
    this.propertyRecords().forEach((record) => {
      const location = this.formatPropertyLocation(record);
      if (location) locations.add(location);
    });
    return Array.from(locations).sort();
  });

  uniqueUnitLocations = computed(() => {
    const locations = new Set<string>();
    this.unitRecords().forEach((record) => {
      if (!record.property) return;
      const property = record.property as any;
      const location = [property.barangay, property.municipality, property.province]
        .filter((v): v is string => Boolean(v && v.trim()))
        .join(', ');
      if (location) locations.add(location);
    });
    return Array.from(locations).sort();
  });

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly toastService: ToastService
  ) {}

  async ngOnInit(): Promise<void> {
    await this.loadPendingItems();
  }

  setActiveTab(tab: 'properties' | 'units'): void {
    this.activeTab.set(tab);
  }

  setPropertyStatusFilter(status: 'all' | 'pending' | 'approved' | 'rejected'): void {
    this.selectedPropertyStatus.set(status);
  }

  setUnitStatusFilter(status: 'all' | 'pending' | 'approved' | 'rejected'): void {
    this.selectedUnitStatus.set(status);
  }

  setPropertySearchQuery(query: string): void {
    this.propertySearchQuery.set(query);
  }

  setUnitSearchQuery(query: string): void {
    this.unitSearchQuery.set(query);
  }

  setPropertyLocation(location: string): void {
    this.selectedPropertyLocation.set(location);
  }

  setUnitLocation(location: string): void {
    this.selectedUnitLocation.set(location);
  }

  clearPropertyFilters(): void {
    this.propertySearchQuery.set('');
    this.selectedPropertyLocation.set('');
    this.selectedPropertyStatus.set('all');
  }

  clearUnitFilters(): void {
    this.unitSearchQuery.set('');
    this.selectedUnitLocation.set('');
    this.selectedUnitStatus.set('all');
  }

  async loadPendingItems(): Promise<void> {
    this.loading.set(true);

    try {
      const [propertiesResult, unitsResult] = await Promise.all([
        this.supabaseService.client
          .from('properties')
          .select('id, name, address, barangay, municipality, province, description, image_url, amenities, house_rules, created_at, status, approval_status, approval_remarks, landlord:landlord_id(full_name, contact_number)')
          .eq('is_active', true)
          .order('created_at', { ascending: false }),
        this.supabaseService.client
          .from('units')
          .select('id, room_number, type, capacity, monthly_rent, created_at, status, approval_status, approval_remarks, property:property_id(id, name, landlord:landlord_id(full_name, contact_number))')
          .order('created_at', { ascending: false })
      ]);

      if (propertiesResult.error) throw propertiesResult.error;
      if (unitsResult.error) throw unitsResult.error;

      const normalizedProperties: PendingPropertyRow[] = (propertiesResult.data || []).map((row: any) => ({
        id: row.id,
        name: row.name,
        address: row.address,
        barangay: row.barangay,
        municipality: row.municipality,
        province: row.province,
        description: row.description,
        image_url: row.image_url,
        amenities: row.amenities,
        house_rules: row.house_rules,
        created_at: row.created_at,
        status: row.status,
        approval_status: row.approval_status,
        approval_remarks: row.approval_remarks,
        landlord: this.unwrapRelation(row.landlord)
      }));

      const normalizedUnits: PendingUnitRow[] = (unitsResult.data || []).map((row: any) => {
        const property = this.unwrapRelation(row.property);
        return {
          id: row.id,
          room_number: row.room_number,
          type: row.type,
          capacity: row.capacity,
          monthly_rent: row.monthly_rent,
          created_at: row.created_at,
          status: row.status,
          approval_status: row.approval_status,
          approval_remarks: row.approval_remarks,
          property: property
            ? {
                id: property.id,
                name: property.name,
                landlord: this.unwrapRelation(property.landlord)
              }
            : null
        };
      });

      this.propertyRecords.set(normalizedProperties);
      this.unitRecords.set(normalizedUnits);
    } catch (error) {
      console.error('Failed to load pending properties and units:', error);
      this.toastService.error('Unable to load property and unit review records.');
    } finally {
      this.loading.set(false);
    }
  }

  canReview(status?: 'pending' | 'approved' | 'rejected'): boolean {
    return (status || 'pending') === 'pending';
  }

  async approveProperty(propertyId: string): Promise<void> {
    const adminId = await this.getAdminId();
    if (!adminId) return;

    try {
      const { error } = await this.supabaseService.client
        .from('properties')
        .update({
          approval_status: 'approved',
          approval_remarks: null,
          approved_at: new Date().toISOString(),
          approved_by: adminId,
          status: 'active'
        })
        .eq('id', propertyId);

      if (error) throw error;

      this.toastService.success('Property approved.');
      await this.loadPendingItems();
    } catch (error) {
      console.error('Failed to approve property:', error);
      this.toastService.error('Failed to approve property.');
    }
  }

  async rejectProperty(propertyId: string): Promise<void> {
    const adminId = await this.getAdminId();
    if (!adminId) return;

    const remarks = window.prompt('Optional rejection remarks for the landlord:', '')?.trim() || null;

    try {
      const { error } = await this.supabaseService.client
        .from('properties')
        .update({
          approval_status: 'rejected',
          approval_remarks: remarks,
          approved_at: new Date().toISOString(),
          approved_by: adminId,
          status: 'inactive'
        })
        .eq('id', propertyId);

      if (error) throw error;

      this.toastService.success('Property rejected.');
      await this.loadPendingItems();
    } catch (error) {
      console.error('Failed to reject property:', error);
      this.toastService.error('Failed to reject property.');
    }
  }

  async approveUnit(unitId: string): Promise<void> {
    const adminId = await this.getAdminId();
    if (!adminId) return;

    try {
      const { error } = await this.supabaseService.client
        .from('units')
        .update({
          approval_status: 'approved',
          approval_remarks: null,
          approved_at: new Date().toISOString(),
          approved_by: adminId,
          status: 'available'
        })
        .eq('id', unitId);

      if (error) throw error;

      this.toastService.success('Unit approved.');
      await this.loadPendingItems();
    } catch (error) {
      console.error('Failed to approve unit:', error);
      this.toastService.error('Failed to approve unit.');
    }
  }

  async rejectUnit(unitId: string): Promise<void> {
    const adminId = await this.getAdminId();
    if (!adminId) return;

    const remarks = window.prompt('Optional rejection remarks for the landlord:', '')?.trim() || null;

    try {
      const { error } = await this.supabaseService.client
        .from('units')
        .update({
          approval_status: 'rejected',
          approval_remarks: remarks,
          approved_at: new Date().toISOString(),
          approved_by: adminId,
          status: 'maintenance'
        })
        .eq('id', unitId);

      if (error) throw error;

      this.toastService.success('Unit rejected.');
      await this.loadPendingItems();
    } catch (error) {
      console.error('Failed to reject unit:', error);
      this.toastService.error('Failed to reject unit.');
    }
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

  formatPropertyLocation(property: PendingPropertyRow): string {
    return [property.barangay, property.municipality, property.province]
      .filter((value): value is string => Boolean(value && value.trim()))
      .join(', ');
  }

  async openPropertyDetails(propertyId: string): Promise<void> {
    this.detailLoading.set(true);
    this.showPropertyDetailModal.set(true);

    try {
      const { data, error } = await this.supabaseService.client
        .from('properties')
        .select(
          'id, name, address, barangay, municipality, province, description, image_url, amenities, house_rules, created_at, status, approval_status, approval_remarks, landlord:landlord_id(full_name, contact_number), units(id, room_number, type, capacity, monthly_rent, created_at, status, approval_status, approval_remarks)'
        )
        .eq('id', propertyId)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        this.selectedPropertyDetail.set(null);
        return;
      }

      const normalizedUnits: PendingUnitRow[] = (data.units || []).map((unit: any) => ({
        id: unit.id,
        room_number: unit.room_number,
        type: unit.type,
        capacity: unit.capacity,
        monthly_rent: unit.monthly_rent,
        created_at: unit.created_at,
        status: unit.status,
        approval_status: unit.approval_status,
        approval_remarks: unit.approval_remarks,
        property: {
          id: data.id,
          name: data.name,
          landlord: this.unwrapRelation(data.landlord)
        }
      }));

      this.selectedPropertyDetail.set({
        id: data.id,
        name: data.name,
        address: data.address,
        barangay: data.barangay,
        municipality: data.municipality,
        province: data.province,
        description: data.description,
        image_url: data.image_url,
        amenities: data.amenities,
        house_rules: data.house_rules,
        created_at: data.created_at,
        status: data.status,
        approval_status: data.approval_status,
        approval_remarks: data.approval_remarks,
        landlord: this.unwrapRelation(data.landlord),
        units: normalizedUnits
      });
    } catch (error) {
      console.error('Failed to load property draft details:', error);
      this.toastService.error('Unable to load property details.');
      this.closePropertyDetails();
    } finally {
      this.detailLoading.set(false);
    }
  }

  closePropertyDetails(): void {
    this.showPropertyDetailModal.set(false);
    this.selectedPropertyDetail.set(null);
    this.detailLoading.set(false);
  }

  formatAmenities(value: unknown): string[] {
    if (!value) return [];
    if (Array.isArray(value)) {
      return value.map((item) => String(item).trim()).filter(Boolean);
    }
    if (typeof value === 'string') {
      return value.split(/,|\n/).map((item) => item.trim()).filter(Boolean);
    }

    return [];
  }

  formatApprovalStatus(status?: 'pending' | 'approved' | 'rejected'): string {
    if (!status || status === 'pending') return 'Pending Review';
    if (status === 'approved') return 'Approved';
    return 'Rejected';
  }

  getApprovalStatusClass(status?: 'pending' | 'approved' | 'rejected'): string {
    if (status === 'approved') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    if (status === 'rejected') return 'border-rose-200 bg-rose-50 text-rose-700';
    return 'border-amber-200 bg-amber-50 text-amber-700';
  }

  private unwrapRelation<T>(value: T | T[] | null): T | null {
    if (Array.isArray(value)) {
      return (value[0] as T) || null;
    }

    return value || null;
  }

  private async getAdminId(): Promise<string | null> {
    const user = await this.supabaseService.getCurrentUser();

    if (!user) {
      this.toastService.error('You must be logged in as admin to review items.');
      return null;
    }

    return user.id;
  }
}
