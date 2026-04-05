import { Component, HostListener, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../../../core/services/supabase.service';
import { ModalService } from '../../../shared/services/modal.service';
import { ToastService } from '../../../shared/services/toast.service';
import { TenantApplication } from '../../../shared/models/type';

@Component ({
    selector: 'app-landlord-applications',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './landlord-applications.html',
})

export class LandlordApplications implements OnInit {

    applications = signal<any[]>([]);
    loading = signal(true);
    selectedApplication: any = null;
    showConfirmModal = signal(false);
    actionType: 'approve' | 'reject' | null = null;
    preferredViewMode = signal<'table' | 'card'>('table');
    viewportWidth = signal(0);
    effectiveViewMode = computed(() => this.viewportWidth() < 768 ? 'card' : this.preferredViewMode());
    searchQuery = signal('');
    filteredApplications = computed(() => {
        const query = this.searchQuery().trim().toLowerCase();
        const applications = this.applications();

        if (!query) return applications;

        return applications.filter(app => {
            const tenantName = app.tenant?.full_name?.toLowerCase() || '';
            const tenantContact = app.tenant?.contact_number?.toLowerCase() || '';
            const propertyName = app.property?.name?.toLowerCase() || '';
            const roomNumber = String(app.unit?.room_number || '').toLowerCase();
            const location = [app.property?.barangay, app.property?.municipality, app.property?.province]
                .filter(Boolean)
                .join(', ')
                .toLowerCase();

            return [tenantName, tenantContact, propertyName, roomNumber, location].some(value => value.includes(query));
        });
    });

    constructor(
        private supabaseService: SupabaseService,
        private modalService: ModalService,
        private toastService: ToastService
    ) {}

    async ngOnInit() {
        this.viewportWidth.set(window.innerWidth);
        await this.loadApplications()
    }

    @HostListener('window:resize')
    onWindowResize() {
        this.viewportWidth.set(window.innerWidth);
    }

    setViewMode(mode: 'table' | 'card') {
        this.preferredViewMode.set(mode);
    }

    getMessagePreview(message: string | null | undefined, maxLength = 56): string {
        if (!message) return 'No message';

        const normalized = message.trim().replace(/\s+/g, ' ');
        if (normalized.length <= maxLength) return normalized;

        return `${normalized.slice(0, maxLength).trimEnd()}...`;
    }

    openTenantMessage(message: string | null | undefined) {
        if (!message?.trim()) return;

        this.modalService.info('Message from Tenant', message.trim(), 'Close');
    }

    async loadApplications() {
        this.loading.set(true);
        try{
            const user = await this.supabaseService.getCurrentUser();
            if(!user) return;

            const { data, error } = await this.supabaseService.client
                .from('tenant_applications')
                .select(`
                    *, 
                    tenant:profiles!tenant_id(full_name, contact_number),
                    unit:units!unit_id(room_number, type, monthly_rent, property:properties!property_id(id, name, address, barangay, municipality, province, landlord_id))
                    `)
                    .order('application_date', { ascending: false});

            if (error) throw error;
            
            // Filter by landlord_id and flatten the property data for template access
            const filteredData = (data || [])
                .filter(app => app.unit?.property?.landlord_id === user.id)
                .map(app => ({
                    ...app,
                    property: app.unit?.property // Flatten property to top level
                }));
            this.applications.set(filteredData);
        } catch (error) {
            console.error('Error loading applications:', error);
            this.toastService.error('failed to load applications');
        } finally {
            this.loading.set(false);
        }
    }

    openConfirmModal(application: any, action: 'approve' | 'reject') {
        this.selectedApplication = application;
        this.actionType = action;
        this.showConfirmModal.set(true);
    }

    closeConfirmModal() {
        this.showConfirmModal.set(false);
        this.selectedApplication = null;
        this.actionType = null;
    }

    async confirmAction() {
        if (!this.selectedApplication || !this.actionType) return;

        const newStatus = this.actionType === 'approve' ? 'approved' : 'rejected';
        const actionLabel = this.actionType === 'approve' ? 'approved' : 'rejected';

        try{
            const { data, error } = await this.supabaseService.client
                .from('tenant_applications')
                .update({ status: newStatus })
                .eq('id', this.selectedApplication.id)
                .select('id, status')
                .single();

            if(error) throw error;
            if (!data) throw new Error('Application was not updated.');

            this.toastService.success(`Application ${actionLabel} successfully!`);
            this.closeConfirmModal();
            await this.loadApplications();
        } catch (error) {
            console.error('Error updating application:', error);
            this.toastService.error(`Failed to ${this.actionType} application`);
        }

    }
}