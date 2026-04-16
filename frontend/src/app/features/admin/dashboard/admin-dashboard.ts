import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { SupabaseService } from '../../../core/services/supabase.service';
import { ModalService } from '../../../shared/services/modal.service';
import { ToastService } from '../../../shared/services/toast.service';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin-dashboard.html'
})
export class AdminDashboard implements OnInit {

  loading = signal(true);
  adminName = signal('Admin');
  totalTenants = signal(0);
  totalLandlords = signal(0);
  totalProperties = signal(0);
  pendingApplications = signal(0);
  tenants = signal<any[]>([]);
  landlords = signal<any[]>([]);
  properties = signal<any[]>([]);
  pendingApplicationRows = signal<any[]>([]);
  recentApplications = signal<any[]>([]);

  constructor(
    private supabaseService: SupabaseService,
    private modalService: ModalService,
    private toastService: ToastService,
    private router: Router
  ) {}

  async ngOnInit(): Promise<void> {
    await this.loadDashboardData();
  }

  async loadDashboardData(): Promise<void> {
    this.loading.set(true);

    try {
      const profile = await this.supabaseService.getCurrentProfileStrict();
      if (profile?.full_name) {
        this.adminName.set(profile.full_name);
      }

      const [profilesResult, propertiesResult, pendingApplicationsResult, recentApplicationsResult] = await Promise.all([
        this.supabaseService.client
          .from('profiles')
          .select('id, role, full_name, contact_number, created_at')
          .order('created_at', { ascending: false }),
        this.supabaseService.client
          .from('properties')
          .select('id, name, status, barangay, municipality, province, created_at')
          .order('created_at', { ascending: false }),
        this.supabaseService.client
          .from('tenant_applications')
          .select(`
            id,
            status,
            application_date,
            tenant:tenant_id (full_name),
            unit:unit_id (
              room_number,
              property:property_id (name)
            )
          `)
          .eq('status', 'pending')
          .order('application_date', { ascending: false }),
        this.supabaseService.client
          .from('tenant_applications')
          .select(`
            id,
            status,
            application_date,
            tenant:tenant_id (full_name),
            unit:unit_id (
              room_number,
              property:property_id (name)
            )
          `)
          .eq('status', 'pending')
          .order('application_date', { ascending: false })
          .limit(5)
      ]);

      if (profilesResult.error) throw profilesResult.error;
      if (propertiesResult.error) throw propertiesResult.error;
      if (pendingApplicationsResult.error) throw pendingApplicationsResult.error;
      if (recentApplicationsResult.error) throw recentApplicationsResult.error;

      const profiles = profilesResult.data || [];
      const tenants = profiles.filter((entry: any) => String(entry.role || '').trim().toLowerCase() === 'tenant');
      const landlords = profiles.filter((entry: any) => String(entry.role || '').trim().toLowerCase() === 'landlord');
      const properties = propertiesResult.data || [];
      const pendingApplications = pendingApplicationsResult.data || [];

      this.tenants.set(tenants);
      this.landlords.set(landlords);
      this.properties.set(properties);
      this.pendingApplicationRows.set(pendingApplications);
      this.totalTenants.set(tenants.length);
      this.totalLandlords.set(landlords.length);
      this.totalProperties.set(properties.length);
      this.pendingApplications.set(pendingApplications.length);
      this.recentApplications.set(recentApplicationsResult.data || []);
    } catch (error) {
      console.error('Error loading admin dashboard data:', error);
      this.toastService.error('Failed to load dashboard data');
    } finally {
      this.loading.set(false);
    }
  }

  getDisplayName(value: string | null | undefined): string {
    return value?.trim() || 'Unknown';
  }

  openTenantsModal(): void {
    this.modalService.open({
      type: 'info',
      title: 'Tenant Records',
      message: 'People currently registered as tenants.',
      table: {
        columns: [
          { key: 'name', label: 'Name' },
          { key: 'contact', label: 'Contact' },
          { key: 'joined', label: 'Joined' }
        ],
        rows: this.tenants().map((tenant: any) => ({
          name: this.getDisplayName(tenant.full_name),
          contact: tenant.contact_number || 'N/A',
          joined: this.formatDate(tenant.created_at)
        })),
        emptyMessage: 'No tenant records found.'
      }
    });
  }

  openLandlordsModal(): void {
    this.modalService.open({
      type: 'info',
      title: 'Landlord Records',
      message: 'People currently registered as property owners.',
      table: {
        columns: [
          { key: 'name', label: 'Name' },
          { key: 'contact', label: 'Contact' },
          { key: 'joined', label: 'Joined' }
        ],
        rows: this.landlords().map((landlord: any) => ({
          name: this.getDisplayName(landlord.full_name),
          contact: landlord.contact_number || 'N/A',
          joined: this.formatDate(landlord.created_at)
        })),
        emptyMessage: 'No landlord records found.'
      }
    });
  }

  openPropertiesModal(): void {
    this.modalService.open({
      type: 'info',
      title: 'Property Records',
      message: 'All properties currently in the system.',
      table: {
        columns: [
          { key: 'name', label: 'Property Name' },
          { key: 'location', label: 'Location' },
          { key: 'status', label: 'Status' },
          { key: 'created', label: 'Created' }
        ],
        rows: this.properties().map((property: any) => ({
          name: property.name || 'Unnamed property',
          location: [property.barangay, property.municipality, property.province].filter(Boolean).join(', ') || 'N/A',
          status: property.status || 'N/A',
          created: this.formatDate(property.created_at)
        })),
        emptyMessage: 'No property records found.'
      }
    });
  }

  openPendingApplicationsModal(): void {
    this.modalService.open({
      type: 'info',
      title: 'Pending Application Records',
      message: 'All rental applications waiting for review.',
      table: {
        columns: [
          { key: 'tenant', label: 'Tenant' },
          { key: 'property', label: 'Property' },
          { key: 'unit', label: 'Unit' },
          { key: 'applied', label: 'Applied' }
        ],
        rows: this.pendingApplicationRows().map((application: any) => ({
          tenant: this.getDisplayName(application.tenant?.full_name),
          property: application.unit?.property?.name || 'Unknown property',
          unit: application.unit?.room_number || 'N/A',
          applied: this.formatDate(application.application_date)
        })),
        emptyMessage: 'No pending applications found.'
      }
    });
  }

  formatDate(value: string | null | undefined): string {
    if (!value) return 'Not set';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Not set';

    return new Intl.DateTimeFormat('en-PH', {
      month: 'short',
      day: '2-digit',
      year: 'numeric'
    }).format(date);
  }

  async logout() {
    await this.supabaseService.client.auth.signOut();
    this.router.navigate(['/landing']);
  }
}