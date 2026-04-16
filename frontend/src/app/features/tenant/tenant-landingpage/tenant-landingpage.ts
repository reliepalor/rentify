import { Component, OnInit, signal, computed, AfterViewInit, CUSTOM_ELEMENTS_SCHEMA, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SupabaseService } from '../../../core/services/supabase.service';
import { TenantHeaderComponent } from '../../../shared/components/header/tenant-header.component';
import { TenantFooterComponent } from '../../../shared/components/footer/tenant-footer.component';
import { Property, Unit } from '../../../shared/models/type';
import { ModalService } from '../../../shared/services/modal.service';

@Component({
  selector: 'app-tenant-landingpage',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TenantHeaderComponent, TenantFooterComponent],
  templateUrl: './tenant-landingpage.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class TenantLandingpageComponent implements OnInit, AfterViewInit {
  properties = signal<Property[]>([]);
  units = signal<Unit[]>([]);
  loading = signal(true);
  pageLoaded = signal(false);
  searchQuery = signal('');
  filterLocation = signal('');
  filterMaxPrice = signal(0);
  activeView = signal<'properties' | 'units'>('properties');
  private scrollObserver?: IntersectionObserver;
  private previousScrollBehavior = '';

  checkInDate: string = '';
  checkOutDate: string = '';
  guests: number = 2;

  constructor(
    private supabaseService: SupabaseService,
    private modalService: ModalService
  ) {}

  async ngOnInit() {
    this.previousScrollBehavior = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = 'smooth';

    await this.loadApprovedProperties();

    window.requestAnimationFrame(() => {
      this.pageLoaded.set(true);
    });
  }

  ngAfterViewInit() {
    this.setupScrollAnimations();
  }

  private setupScrollAnimations() {
    this.scrollObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const delay = Number((entry.target as HTMLElement).dataset['delay'] || 0);
            (entry.target as HTMLElement).style.transitionDelay = `${delay}ms`;
            entry.target.classList.add('opacity-100', 'translate-y-0');
            entry.target.classList.remove('opacity-0', 'translate-y-8');
            this.scrollObserver?.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -80px 0px' }
    );

    document.querySelectorAll('[data-scroll-animate]').forEach((el, index) => {
      (el as HTMLElement).dataset['delay'] = String((index % 8) * 40);
      el.classList.add('opacity-0', 'translate-y-8', 'transition-all', 'duration-700', 'ease-out');
      this.scrollObserver?.observe(el);
    });
  }

  ngOnDestroy(): void {
    this.scrollObserver?.disconnect();
    document.documentElement.style.scrollBehavior = this.previousScrollBehavior;
  }

  async loadApprovedProperties() {
    this.loading.set(true);
    try {
      const { data, error } = await this.supabaseService.client
        .from('properties')
        .select('*, units(*)')
        .eq('approval_status', 'approved')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(12);

      if (error) throw error;

      const typedData = (data as any[]) || [];
      this.properties.set(typedData);

      // Extract all units from properties
      const allUnits: Unit[] = [];
      typedData.forEach((property) => {
        if (property.units && Array.isArray(property.units)) {
          allUnits.push(...property.units.filter((u: Unit) => u.approval_status === 'approved'));
        }
      });
      this.units.set(allUnits);
    } catch (error) {
      console.error('Error loading properties:', error);
    } finally {
      this.loading.set(false);
    }
  }

  filteredProperties = computed(() => {
    const query = this.searchQuery().toLowerCase();
    const location = this.filterLocation().toLowerCase();
    const maxPrice = this.filterMaxPrice();

    return this.properties().filter((property) => {
      const matchesSearch =
        property.name.toLowerCase().includes(query) ||
        property.description?.toLowerCase().includes(query) ||
        property.address?.toLowerCase().includes(query);

      const matchesLocation =
        !location ||
        property.barangay?.toLowerCase().includes(location) ||
        property.municipality?.toLowerCase().includes(location) ||
        property.province?.toLowerCase().includes(location);

      const minUnitPrice = property.units?.length
        ? Math.min(...(property.units.map((u: Unit) => u.monthly_rent) as number[]))
        : 0;

      const matchesPrice = maxPrice === 0 || minUnitPrice <= maxPrice;

      return matchesSearch && matchesLocation && matchesPrice;
    });
  });

  filteredUnits = computed(() => {
    const query = this.searchQuery().toLowerCase();
    const location = this.filterLocation().toLowerCase();
    const maxPrice = this.filterMaxPrice();

    return this.units().filter((unit) => {
      const property = this.properties().find((p) => p.id === unit.property_id);
      if (!property) return false;

      const matchesSearch =
        unit.room_number.toLowerCase().includes(query) ||
        property.name.toLowerCase().includes(query);

      const matchesLocation =
        !location ||
        property.barangay?.toLowerCase().includes(location) ||
        property.municipality?.toLowerCase().includes(location) ||
        property.province?.toLowerCase().includes(location);

      const matchesPrice = maxPrice === 0 || unit.monthly_rent <= maxPrice;

      return matchesSearch && matchesLocation && matchesPrice;
    });
  });

  getPropertyLocation(property: Property): string {
    const parts = [property.barangay, property.municipality, property.province]
      .filter(Boolean)
      .join(', ');
    return parts || 'Location unknown';
  }

  formatAmenities(amenities: any): string[] {
    if (!amenities) return [];
    if (Array.isArray(amenities)) return amenities.slice(0, 3);
    if (typeof amenities === 'string') {
      return amenities.split(/,|\n/).slice(0, 3);
    }
    return [];
  }

  getMinUnitPrice(property: Property): number {
    if (!property.units?.length) return 0;
    return Math.min(...(property.units.map((u: Unit) => u.monthly_rent) as number[]));
  }

  onSearch() {
    console.log('Search:', {
      checkIn: this.checkInDate,
      checkOut: this.checkOutDate,
      guests: this.guests
    });
  }

  exploreAccommodations() {
    this.activeView.set('properties');
    window.scrollTo({ top: document.getElementById('properties-section')?.offsetTop || 0, behavior: 'smooth' });
  }

  learnMore() {
    console.log('Learn more clicked');
  }

  setActiveView(view: 'properties' | 'units') {
    this.activeView.set(view);
  }

  clearFilters() {
    this.searchQuery.set('');
    this.filterLocation.set('');
    this.filterMaxPrice.set(0);
  }

  onMaxPriceChange(event: Event) {
    const value = parseInt((event.target as HTMLInputElement).value) || 0;
    this.filterMaxPrice.set(value);
  }

  openPaymentPreferenceModal() {
    this.modalService.open({
      type: 'info',
      title: 'Choose Your Payment Method',
      message: 'Rentify supports digital and in-person payment methods. You can choose the one that works best for your rental arrangement.',
      confirmText: 'Got it',
      table: {
        columns: [
          { key: 'method', label: 'Method' },
          { key: 'bestFor', label: 'Best For' },
          { key: 'speed', label: 'Confirmation' }
        ],
        rows: [
          {
            method: 'GCash',
            bestFor: 'Fast mobile wallet transfers',
            speed: 'Instant'
          },
          {
            method: 'Maya',
            bestFor: 'Cashless monthly payments',
            speed: 'Instant'
          },
          {
            method: 'On-Site Cash',
            bestFor: 'In-person landlord settlement',
            speed: 'Manual verification'
          }
        ],
        emptyMessage: 'No payment methods available at the moment.'
      }
    });
  }
}
