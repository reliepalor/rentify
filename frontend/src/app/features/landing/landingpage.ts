import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TenantHeaderComponent } from '../../shared/components/header/tenant-header.component';
import { TenantFooterComponent } from '../../shared/components/footer/tenant-footer.component';
import { SupabaseService } from '../../core/services/supabase.service';
import { ModalService } from '../../shared/services/modal.service';
import { Property, Unit } from '../../shared/models/type';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, FormsModule, TenantHeaderComponent, TenantFooterComponent],
  templateUrl: './landingpage.html'
})
export class LandingComponent implements OnInit {
  checkInDate: string = '';
  checkOutDate: string = '';
  guests: number = 2;
  loading = signal(true);
  isLoggedIn = signal(false);
  properties = signal<Property[]>([]);

  constructor(
    private supabaseService: SupabaseService,
    private modalService: ModalService,
    private router: Router
  ) {}

  async ngOnInit(): Promise<void> {
    await Promise.all([this.checkSession(), this.loadApprovedProperties()]);
  }

  filteredProperties = computed(() => this.properties().slice(0, 6));

  private async checkSession(): Promise<void> {
    const {
      data: { session }
    } = await this.supabaseService.client.auth.getSession();

    this.isLoggedIn.set(!!session);
  }

  private async loadApprovedProperties(): Promise<void> {
    this.loading.set(true);

    try {
      const { data, error } = await this.supabaseService.client
        .from('properties')
        .select('*, units(*)')
        .eq('approval_status', 'approved')
        .eq('status', 'active')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(6);

      if (error) {
        throw error;
      }

      this.properties.set((data as Property[]) || []);
    } finally {
      this.loading.set(false);
    }
  }

  getPropertyLocation(property: Property): string {
    return [property.barangay, property.municipality, property.province]
      .filter(Boolean)
      .join(', ') || 'Location unknown';
  }

  getMinUnitPrice(property: Property): number {
    if (!property.units?.length) return 0;

    return Math.min(...(property.units.map((unit: Unit) => unit.monthly_rent) as number[]));
  }

  openPaymentPreferenceModal(): void {
    this.modalService.open({
      type: 'info',
      title: 'Rentify Payment Methods',
      message: 'You can pay via GCash, Maya, or on-site payment depending on your preferred rental arrangement.',
      confirmText: 'Got it',
      table: {
        columns: [
          { key: 'method', label: 'Method' },
          { key: 'bestFor', label: 'Best For' },
          { key: 'confirmation', label: 'Confirmation' }
        ],
        rows: [
          { method: 'GCash', bestFor: 'Instant mobile transfer', confirmation: 'Instant' },
          { method: 'Maya', bestFor: 'Cashless monthly rent', confirmation: 'Instant' },
          { method: 'On-Site Cash', bestFor: 'In-person payment', confirmation: 'Manual verification' }
        ]
      }
    });
  }

  onPropertyActionClick(property: Property): void {
    if (!this.isLoggedIn()) {
      this.modalService.info('Login Required', 'Please log in first to view full property details and apply for units.');
      return;
    }

    this.router.navigate(['/tenant-property', property.id]);
  }

  onSearch() {
    console.log('Search:', {
      checkIn: this.checkInDate,
      checkOut: this.checkOutDate,
      guests: this.guests
    });
    // Add your search logic here
  }

  exploreAccommodations() {
    // Navigate to accommodations section
    console.log('Explore accommodations clicked');
  }

  learnMore() {
    // Navigate to about section
    console.log('Learn more clicked');
  }
}