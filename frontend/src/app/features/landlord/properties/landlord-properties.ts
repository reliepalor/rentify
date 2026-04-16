import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../../core/services/supabase.service';
import { ModalService } from '../../../shared/services/modal.service';
import { ToastService } from '../../../shared/services/toast.service';
import { Property, NewPropertyForm, NewUnitForm } from '../../../shared/models/type';

@Component({
  selector: 'app-landlord-properties',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './landlord-properties.html',
  styleUrls: ['./landlord-properties.scss']
})
export class LandlordPropertiesComponent implements OnInit {

  properties = signal<Property[]>([]);
  loading = signal(true);

  // Modals
  showAddPropertyModal = signal(false);
  showEditPropertyModal = signal(false);
  showAddUnitModal = signal(false);
  showArchivePropertyModal = signal(false);
  addingProperty = signal(false);

  selectedPropertyId = signal<string | null>(null);
  selectedArchivePropertyId = signal<string | null>(null);
  expandedUnitsByProperty = signal<Record<string, boolean>>({});
  viewMode = signal<'table' | 'card'>('table');
  searchQuery = signal('');
  filteredProperties = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const list = this.properties();

    if (!query) return list;

    return list.filter(property => {
      const name = property.name?.toLowerCase() || '';
      const location = this.formatPropertyLocation(property).toLowerCase();
      return name.includes(query) || location.includes(query);
    });
  });
  rejectedProperties = computed(() => this.properties().filter((property) => property.approval_status === 'rejected'));
  rejectedUnits = computed(() =>
    this.properties().flatMap((property) =>
      (property.units || [])
        .filter((unit) => unit.approval_status === 'rejected')
        .map((unit) => ({
          ...unit,
          propertyId: property.id,
          propertyName: property.name
        }))
    )
  );

  // Forms
  newProperty: NewPropertyForm = this.createEmptyPropertyForm();
  editingProperty: NewPropertyForm = this.createEmptyPropertyForm();
  newUnit: NewUnitForm = this.createEmptyUnitForm();

  selectedPropertyImage: File | null = null;
  editingPropertyImage: File | null = null;

  constructor(
    private supabaseService: SupabaseService,
    private modalService: ModalService,
    private toastService: ToastService
  ) {}

  async ngOnInit() {
    await this.loadProperties();
  }

  createEmptyPropertyForm(): NewPropertyForm {
    return {
      name: '',
      address: '',
      barangay: '',
      municipality: '',
      province: '',
      description: '',
      image_url: '',
      amenities: '',
      house_rules: '',
      status: 'active'
    };
  }

  createEmptyUnitForm(): NewUnitForm {
    return {
      room_number: '',
      type: 'single',
      capacity: 1,
      monthly_rent: 0
    };
  }

  async loadProperties() {
    this.loading.set(true);
    try {
      const user = await this.supabaseService.getCurrentUser();
      if (!user) return;

      const { data, error } = await this.supabaseService.client
        .from('properties')
        .select(`
          *,
          units (*)
        `)
        .eq('landlord_id', user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      this.properties.set(data || []);
      this.expandedUnitsByProperty.set({});
    } catch (error) {
      console.error('Error loading properties:', error);
      this.modalService.error('Load Failed', 'Failed to load properties. Please try again.');
    } finally {
      this.loading.set(false);
    }
  }

  // ==================== PROPERTY CRUD ====================

  openAddPropertyModal() {
    this.newProperty = this.createEmptyPropertyForm();
    this.selectedPropertyImage = null;
    this.showAddPropertyModal.set(true);
  }

  openEditPropertyModal(property: Property) {
    this.editingProperty = {
      name: property.name,
      address: property.address || '',
      barangay: property.barangay || '',
      municipality: property.municipality || '',
      province: property.province || '',
      description: property.description || '',
      image_url: property.image_url || '',
      amenities: Array.isArray(property.amenities) ? property.amenities.join(', ') : '',
      house_rules: property.house_rules || '',
      status: property.status
    };
    this.selectedPropertyId.set(property.id);
    this.showEditPropertyModal.set(true);
  }

  openResubmitProperty(propertyId: string): void {
    const property = this.properties().find((item) => item.id === propertyId);
    if (!property) return;

    this.openEditPropertyModal(property);
  }

  openResubmitUnit(propertyId: string): void {
    this.openAddUnitModal(propertyId);
  }

  closeAddPropertyModal() {
    this.showAddPropertyModal.set(false);
  }

  closeEditPropertyModal() {
    this.showEditPropertyModal.set(false);
    this.selectedPropertyId.set(null);
    this.editingPropertyImage = null;
  }

  openArchivePropertyModal(propertyId: string) {
    this.selectedArchivePropertyId.set(propertyId);
    this.showArchivePropertyModal.set(true);
  }

  closeArchivePropertyModal() {
    this.showArchivePropertyModal.set(false);
    this.selectedArchivePropertyId.set(null);
  }

  async confirmArchiveProperty() {
    const propertyId = this.selectedArchivePropertyId();
    if (!propertyId) return;

    await this.archiveProperty(propertyId);
    this.closeArchivePropertyModal();
  }

  async addProperty() {
    if (this.addingProperty()) {
      return;
    }

    if (!this.newProperty.name?.trim() || !this.newProperty.barangay?.trim() || !this.newProperty.municipality?.trim() || !this.newProperty.province?.trim()) {
      this.modalService.info('Missing Information', 'Property name, barangay, municipality, and province are required.');
      return;
    }

    this.addingProperty.set(true);

    try {
      const user = await this.supabaseService.getCurrentUser();
      if (!user) return;

      const imageUrl = this.selectedPropertyImage 
        ? await this.uploadPropertyImage(this.selectedPropertyImage, user.id) 
        : null;

      const { error } = await this.supabaseService.client
        .from('properties')
        .insert({
          landlord_id: user.id,
          name: this.newProperty.name.trim(),
          address: this.buildPropertyAddress(this.newProperty),
          barangay: this.newProperty.barangay.trim(),
          municipality: this.newProperty.municipality.trim(),
          province: this.newProperty.province.trim(),
          description: this.newProperty.description?.trim() || null,
          image_url: imageUrl,
          amenities: this.parseAmenities(this.newProperty.amenities),
          house_rules: this.newProperty.house_rules?.trim() || null,
          status: 'inactive',
          approval_status: 'pending',
          approval_remarks: null,
          approved_at: null,
          approved_by: null,
          is_active: true
        });

      if (error) throw error;

      this.toastService.success('Property submitted for admin review.');
      this.closeAddPropertyModal();
      await this.loadProperties();
    } catch (error) {
      console.error(error);
      this.modalService.error('Add Property Failed', 'Failed to add property. Please try again.');
    } finally {
      this.addingProperty.set(false);
    }
  }

  async updateProperty() {
    const propertyId = this.selectedPropertyId();
    if (!propertyId) return;

    if (!this.editingProperty.name?.trim() || !this.editingProperty.barangay?.trim() || !this.editingProperty.municipality?.trim() || !this.editingProperty.province?.trim()) {
      this.modalService.info('Missing Information', 'Property name, barangay, municipality, and province are required.');
      return;
    }

    try {
      const user = await this.supabaseService.getCurrentUser();
      if (!user) {
        this.modalService.error('Authentication Required', 'You must be logged in to update a property.');
        return;
      }

      const imageUrl = this.editingPropertyImage
        ? await this.uploadPropertyImage(this.editingPropertyImage, user.id)
        : this.editingProperty.image_url;

      const { error } = await this.supabaseService.client
        .from('properties')
        .update({
          name: this.editingProperty.name.trim(),
          address: this.buildPropertyAddress(this.editingProperty),
          barangay: this.editingProperty.barangay.trim(),
          municipality: this.editingProperty.municipality.trim(),
          province: this.editingProperty.province.trim(),
          description: this.editingProperty.description?.trim() || null,
          image_url: imageUrl,
          amenities: this.parseAmenities(this.editingProperty.amenities),
          house_rules: this.editingProperty.house_rules?.trim() || null,
          status: 'inactive',
          approval_status: 'pending',
          approval_remarks: null,
          approved_at: null,
          approved_by: null
        })
        .eq('id', propertyId);

      if (error) throw error;

      this.toastService.success('Property changes submitted for admin review.');
      this.closeEditPropertyModal();
      await this.loadProperties();
    } catch (error) {
      console.error(error);
      this.modalService.error('Update Failed', 'Failed to update property. Please try again.');
    }
  }

  async archiveProperty(propertyId: string) {
    try {
      const { error } = await this.supabaseService.client
        .from('properties')
        .update({ is_active: false })
        .eq('id', propertyId);

      if (error) throw error;

      this.toastService.success('Property archived successfully');
      await this.loadProperties();
    } catch (error) {
      this.modalService.error('Archive Failed', 'Failed to archive property. Please try again.');
    }
  }

  // ==================== UNIT CRUD ====================

  openAddUnitModal(propertyId: string) {
    this.selectedPropertyId.set(propertyId);
    this.newUnit = this.createEmptyUnitForm();
    this.showAddUnitModal.set(true);
  }

  closeAddUnitModal() {
    this.showAddUnitModal.set(false);
    this.selectedPropertyId.set(null);
  }

  async addUnit() {
    const propertyId = this.selectedPropertyId();
    if (!propertyId || !this.newUnit.room_number.trim()) {
      this.modalService.info('Missing Information', 'Please enter a room number.');
      return;
    }

    try {
      const { error } = await this.supabaseService.client
        .from('units')
        .insert({
          property_id: propertyId,
          room_number: this.newUnit.room_number.trim(),
          type: this.newUnit.type,
          capacity: this.newUnit.capacity,
          monthly_rent: this.newUnit.monthly_rent,
          status: 'maintenance',
          approval_status: 'pending',
          approval_remarks: null,
          approved_at: null,
          approved_by: null
        });

      if (error) throw error;

      this.toastService.success('Unit submitted for admin review.');
      this.closeAddUnitModal();
      await this.loadProperties();
    } catch (error) {
      this.modalService.error('Add Unit Failed', 'Failed to add unit. Please try again.');
    }
  }

  // ==================== HELPERS ====================

  private parseAmenities(amenities: string | any): any {
    if (Array.isArray(amenities)) return amenities;
    if (typeof amenities !== 'string') return [];
    return amenities.split(/,|\n/).map(item => item.trim()).filter(Boolean);
  }

  private buildPropertyAddress(form: Pick<NewPropertyForm, 'address' | 'barangay' | 'municipality' | 'province'>): string {
    const explicitAddress = form.address?.trim();
    if (explicitAddress) return explicitAddress;

    return [form.barangay?.trim(), form.municipality?.trim(), form.province?.trim()]
      .filter(Boolean)
      .join(', ');
  }

  private async uploadPropertyImage(file: File, userId: string): Promise<string | null> {
    try {
      const filePath = `${userId}/properties/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

      const { error } = await this.supabaseService.client.storage
        .from('property-images')
        .upload(filePath, file);

      if (error) throw error;

      const { data } = this.supabaseService.client.storage
        .from('property-images')
        .getPublicUrl(filePath);

      return data.publicUrl;
    } catch (error) {
      console.error('Image upload failed:', error);
      return null;
    }
  }

  toggleUnitsVisibility(propertyId: string) {
    this.expandedUnitsByProperty.update(current => ({
      ...current,
      [propertyId]: !current[propertyId]
    }));
  }

  isUnitsVisible(propertyId: string): boolean {
    return !!this.expandedUnitsByProperty()[propertyId];
  }

  formatPropertyLocation(property: Property): string {
    const parts = [property.barangay, property.municipality, property.province]
      .map(part => part?.trim())
      .filter(Boolean);

    return parts.join(', ');
  }

  formatApprovalStatus(status?: 'pending' | 'approved' | 'rejected'): string {
    if (!status) return 'Pending Review';
    if (status === 'pending') return 'Pending Review';
    if (status === 'approved') return 'Approved';
    return 'Rejected';
  }

  getApprovalStatusClass(status?: 'pending' | 'approved' | 'rejected'): string {
    if (status === 'approved') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    if (status === 'rejected') return 'border-rose-200 bg-rose-50 text-rose-700';
    return 'border-amber-200 bg-amber-50 text-amber-700';
  }

  setViewMode(mode: 'table' | 'card') {
    this.viewMode.set(mode);
  }

  onPropertyImageSelected(event: Event, isEdit = false) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] || null;
    
    if (isEdit) {
      this.editingPropertyImage = file;
    } else {
      this.selectedPropertyImage = file;
    }
  }
}