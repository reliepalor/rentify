import { Component, OnInit, signal } from '@angular/core';
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
  showAddUnitModal = signal(false);
  showAddPropertyModal = signal(false);
  selectedPropertyId = signal<string | null>(null);

  createEmptyPropertyForm(): NewPropertyForm {
    return {
      name: '',
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

  newProperty: NewPropertyForm = {
    name: '',
    barangay: '',
    municipality: '',
    province: '',
    description: '',
    image_url: '',
    amenities: '',
    house_rules: '',
    status: 'active'
  };

  newUnit: NewUnitForm = {
    room_number: '',
    type: 'single',
    capacity: 1,
    monthly_rent: 0
  };

  selectedPropertyImage: File | null = null;

  constructor(
    private supabaseService: SupabaseService,
    private modalService: ModalService,
    private toastService: ToastService
  ) {}

  async ngOnInit() {
    await this.loadProperties();
  }

  async loadProperties() {
    this.loading.set(true);
    try {
      const user = await this.supabaseService.getCurrentUser();
      if (!user) {
        this.properties.set([]);
        return;
      }

      const { data, error } = await this.supabaseService.client
        .from('properties')
        .select(`
          *,
          units (*)
        `)
        .eq('landlord_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      this.properties.set(data || []);
    } catch (error) {
      console.error('Error loading properties:', error);
    } finally {
      this.loading.set(false);
    }
  }

  openAddPropertyModal() {
    this.newProperty = this.createEmptyPropertyForm();
    this.selectedPropertyImage = null;
    this.showAddPropertyModal.set(true);
  }

  formatPropertyLocation(property: Property): string {
    return [property.barangay, property.municipality, property.province]
      .filter((part): part is string => Boolean(part))
      .join(', ');
  }

  closeAddPropertyModal() {
    this.showAddPropertyModal.set(false);
  }

  async addProperty() {
    const locationLabel = this.buildLocationLabel();

    if (!this.newProperty.name.trim() || !locationLabel) {
      this.modalService.info('Missing Information', 'Please provide the property name and complete the location fields.');
      return;
    }

    try {
      const user = await this.supabaseService.getCurrentUser();
      if (!user) {
        this.modalService.error('Authentication Required', 'You must be logged in to add a property.');
        return;
      }

      const imageUrl = this.selectedPropertyImage
        ? await this.uploadPropertyImage(this.selectedPropertyImage, user.id)
        : null;

      const { error } = await this.supabaseService.client
        .from('properties')
        .insert({
          landlord_id: user.id,
          name: this.newProperty.name.trim(),
          address: locationLabel,
          barangay: this.newProperty.barangay.trim() || null,
          municipality: this.newProperty.municipality.trim() || null,
          province: this.newProperty.province.trim() || null,
          description: this.newProperty.description?.trim() || null,
          image_url: imageUrl,
          amenities: this.parseAmenities(this.newProperty.amenities),
          house_rules: this.newProperty.house_rules?.trim() || null,
          total_units: 0,
          status: this.newProperty.status
        });

      if (error) throw error;

      this.toastService.success('Property added successfully!');
      this.closeAddPropertyModal();
      await this.loadProperties();
    } catch (error) {
      console.error('Error adding property:', error);
      this.modalService.error('Add Property Failed', 'Failed to add property. Please try again.');
    }
  }

  private parseAmenities(amenities: NewPropertyForm['amenities']) {
    if (typeof amenities !== 'string') {
      return amenities ?? [];
    }

    return amenities
      .split(/,|\n/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private buildLocationLabel(): string {
    const locationParts = [
      this.newProperty.barangay.trim(),
      this.newProperty.municipality.trim(),
      this.newProperty.province.trim()
    ].filter(Boolean);

    return locationParts.length === 3 ? locationParts.join(', ') : '';
  }

  onPropertyImageSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    this.selectedPropertyImage = input.files?.[0] ?? null;
  }

  private async uploadPropertyImage(file: File, userId: string): Promise<string> {
    const fileExtension = file.name.split('.').pop() || 'jpg';
    const sanitizedName = file.name
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_+/g, '_');
    const filePath = `${userId}/${Date.now()}-${sanitizedName}`;

    const { error } = await this.supabaseService.client.storage
      .from('property-images')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || `image/${fileExtension}`
      });

    if (error) {
      throw error;
    }

    const { data } = this.supabaseService.client.storage
      .from('property-images')
      .getPublicUrl(filePath);

    return data.publicUrl;
  }

  openAddUnitModal(propertyId: string) {
    this.selectedPropertyId.set(propertyId);
    this.newUnit = { room_number: '', type: 'single', capacity: 1, monthly_rent: 0 };
    this.showAddUnitModal.set(true);
  }

  closeAddUnitModal() {
    this.showAddUnitModal.set(false);
    this.selectedPropertyId.set(null);
  }

  async addUnit() {
    const propertyId = this.selectedPropertyId();
    const roomNumber = this.newUnit.room_number.trim();

    if (!propertyId || !roomNumber) {
      this.modalService.info('Missing Information', 'Please fill in the room number.');
      return;
    }

    const selectedProperty = this.properties().find((property) => property.id === propertyId);
    const roomNumberInUse = (selectedProperty?.units ?? []).some(
      (unit) => unit.room_number.trim().toLowerCase() === roomNumber.toLowerCase()
    );

    if (roomNumberInUse) {
      this.modalService.error('Room Number Already Used', `Room ${roomNumber} is already in use for this property.`);
      return;
    }

    try {
      const { error } = await this.supabaseService.client
        .from('units')
        .insert({
          property_id: propertyId,
          room_number: roomNumber,
          type: this.newUnit.type,
          capacity: this.newUnit.capacity,
          monthly_rent: this.newUnit.monthly_rent
        });

      if (error) throw error;

      this.toastService.success('Unit added successfully!');
      this.closeAddUnitModal();
      await this.loadProperties(); // Refresh the list
    } catch (error) {
      console.error('Error adding unit:', error);
      this.modalService.error('Add Unit Failed', 'Failed to add unit. Please try again.');
    }
  }
}