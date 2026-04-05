import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from "../../../core/services/supabase.service";
import { ToastService } from "../../../shared/services/toast.service";
import { ModalService } from '../../../shared/services/modal.service';

@Component({
  selector: 'app-landlord-billing',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './landlord-billing.html'
})
export class LandlordBillingComponent implements OnInit {

  billings = signal<any[]>([]);
  loading = signal(true);

  //summary of billings
  totalRevenue = signal(0);
  unpaidCount = signal(0);
  totalUnpaid = signal(0);

  // Record Payment Modal
  showPaymentModal = signal(false);
  selectedBilling: any = null;
  paymentAmount = signal(0);
  paymentMethod = signal('cash');

  constructor(
    private supabaseService: SupabaseService,
    private toastService: ToastService,
    private modalService: ModalService
  ) {}

  async ngOnInit() {
    await this.loadBillings();
  }

 async loadBillings() {
  this.loading.set(true);
  try {
    const user = await this.supabaseService.getCurrentUser();
    if (!user) {
      this.billings.set([]);
      return;
    }

    // Simple query - get all billings linked to this landlord's properties
    const { data, error } = await this.supabaseService.client
      .from('billings')
      .select(`
        *,
        tenant:tenant_id (full_name),
        property:property_id (name),
        unit:unit_id (room_number, type),
        rental:rental_id (
          tenant_id,
          tenant:tenant_id (full_name)
        )
      `)
      .order('due_date', { ascending: false });

    if (error) {
      console.error('Error loading billings:', error);
      throw error;
    }

    this.billings.set(data || []);

    // Calculate summary
    let revenue = 0;
    let unpaid = 0;
    let totalUnpaidAmount = 0;

    (data || []).forEach((bill: any) => {
      if (bill.status === 'paid') {
        revenue += Number(bill.total_amount || 0);
      } else {
        unpaid++;
        totalUnpaidAmount += Number(bill.total_amount || 0);
      }
    });

    this.totalRevenue.set(revenue);
    this.unpaidCount.set(unpaid);
    this.totalUnpaid.set(totalUnpaidAmount);

  } catch (error) {
    console.error('Error loading billings:', error);
    this.toastService.error('Failed to load billings');
    this.billings.set([]);
  } finally {
    this.loading.set(false);
  }
 }

  openPaymentModal(billing: any) {
    this.selectedBilling = billing;
    this.paymentAmount.set(billing.total_amount);
    this.paymentMethod.set('cash');
    this.showPaymentModal.set(true);
  }

  closePaymentModal() {
    this.showPaymentModal.set(false);
    this.selectedBilling = null;
  }

  async recordPayment() {
    if (!this.selectedBilling) return;

    try {
      const { error } = await this.supabaseService.client
        .from('payments')
        .insert({
          billing_id: this.selectedBilling.id,
          tenant_id: this.selectedBilling.tenant_id || this.selectedBilling.rental?.tenant_id,
          amount: this.paymentAmount(),
          method: this.paymentMethod(),
          status: 'completed'
        });

      if (error) throw error;

      // Update billing status to paid
      const { error: updateError } = await this.supabaseService.client
        .from('billings')
        .update({ status: 'paid' })
        .eq('id', this.selectedBilling.id);

      if (updateError) throw updateError;

      this.toastService.success('Payment recorded successfully!');
      this.closePaymentModal();
      await this.loadBillings();
    } catch (error) {
      console.error('Error recording payment:', error);
      this.toastService.error('Failed to record payment');
    }
  }
  
  async generateSampleBills() {
    this.modalService.info('Notice Information', 'In real system, this would generate monthly bills automatically.');
    await this.loadBillings();
  }

exportToCSV() {
    if (this.billings().length === 0) {
      this.toastService.info('No data to export');
      return;
    }

    const headers = ['Tenant', 'Property - Unit', 'Billing Month', 'Total Amount', 'Payment Method', 'Due Date', 'Status'];
    const rows = this.billings().map(bill => [
      bill.tenant?.full_name || bill.rental?.tenant?.full_name || 'Unknown',
      `${bill.property?.name || bill.property_name || 'Unknown Property'} - ${bill.unit?.room_number || bill.unit_label || 'No Unit'}`,
      bill.billing_month,
      bill.total_amount,
        bill.payment_method || 'No payment yet',
      bill.due_date,
      bill.status
    ]);

    let csvContent = headers.join(',') + '\n';
    rows.forEach(row => {
      csvContent += row.join(',') + '\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `billings_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);

    this.toastService.success('Billings exported to CSV');
  }
}