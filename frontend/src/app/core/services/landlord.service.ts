import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';

export type LandlordVerificationStatus = 'pending' | 'approved' | 'rejected' | 'resubmission_required';
export type LandlordDocumentType = 'business_permit' | 'barangay_clearance' | 'valid_id';
export type AdminVerificationAction = 'approved' | 'rejected' | 'resubmission_requested';

export interface LandlordRecord {
  id: string;
  full_name: string;
  email: string;
  contact_number: string | null;
  status: LandlordVerificationStatus;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LandlordDocument {
  id: string;
  landlord_id: string;
  type: LandlordDocumentType;
  file_url: string;
  uploaded_at: string;
}

export interface AdminActionLog {
  id: string;
  landlord_id: string;
  admin_id: string;
  action: AdminVerificationAction;
  remarks: string | null;
  created_at: string;
}

export interface PendingLandlordsFilter {
  search?: string;
  status?: 'all' | LandlordVerificationStatus;
  submittedFrom?: string;
  submittedTo?: string;
}

export interface LandlordReviewDetails {
  landlord: LandlordRecord;
  documents: LandlordDocument[];
  actions: AdminActionLog[];
}

export interface LandlordVerificationSummary {
  status: LandlordVerificationStatus | null;
  is_active: boolean;
}

export interface LandlordPropertyUnitRow {
  propertyName: string;
  location: string;
  unitRoom: string;
  unitType: string;
  monthlyRent: string;
  unitStatus: string;
}

@Injectable({
  providedIn: 'root'
})
export class LandlordService {
  private readonly requiredDocumentTypes: LandlordDocumentType[] = [
    'business_permit',
    'barangay_clearance',
    'valid_id'
  ];

  constructor(private readonly supabaseService: SupabaseService) {}

  async getPendingLandlords(filter: PendingLandlordsFilter = {}): Promise<LandlordRecord[]> {
    const keyword = filter.search?.trim();
    const status = filter.status || 'all';

    let query = this.supabaseService.client
      .from('landlords')
      .select('id, full_name, email, contact_number, status, is_active, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (status === 'all') {
      query = query.in('status', ['pending', 'resubmission_required', 'approved']);
    } else {
      query = query.eq('status', status);
    }

    if (keyword) {
      query = query.or(`full_name.ilike.%${keyword}%,email.ilike.%${keyword}%`);
    }

    if (filter.submittedFrom) {
      query = query.gte('created_at', `${filter.submittedFrom}T00:00:00`);
    }

    if (filter.submittedTo) {
      query = query.lte('created_at', `${filter.submittedTo}T23:59:59`);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return (data || []) as LandlordRecord[];
  }

  async getLandlordPropertyUnits(landlordId: string): Promise<LandlordPropertyUnitRow[]> {
    const { data, error } = await this.supabaseService.client
      .from('properties')
      .select('name, status, barangay, municipality, province, units(room_number, type, monthly_rent, status)')
      .eq('landlord_id', landlordId)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    const rows: LandlordPropertyUnitRow[] = [];

    for (const property of data || []) {
      const location = [property.barangay, property.municipality, property.province]
        .filter(Boolean)
        .join(', ') || 'N/A';

      const units = Array.isArray((property as any).units) ? (property as any).units : [];

      if (units.length === 0) {
        rows.push({
          propertyName: property.name || 'Unnamed property',
          location,
          unitRoom: 'No units',
          unitType: 'N/A',
          monthlyRent: 'N/A',
          unitStatus: property.status || 'N/A'
        });
        continue;
      }

      for (const unit of units) {
        rows.push({
          propertyName: property.name || 'Unnamed property',
          location,
          unitRoom: unit.room_number || 'N/A',
          unitType: unit.type || 'N/A',
          monthlyRent: typeof unit.monthly_rent === 'number' ? `PHP ${unit.monthly_rent.toLocaleString()}` : 'N/A',
          unitStatus: unit.status || 'N/A'
        });
      }
    }

    return rows;
  }

  async getLandlordById(id: string): Promise<LandlordReviewDetails> {
    const { data: landlord, error: landlordError } = await this.supabaseService.client
      .from('landlords')
      .select('id, full_name, email, contact_number, status, is_active, created_at, updated_at')
      .eq('id', id)
      .single();

    if (landlordError || !landlord) {
      throw landlordError || new Error('Landlord record not found.');
    }

    const [{ data: documents, error: documentsError }, { data: actions, error: actionsError }] = await Promise.all([
      this.supabaseService.client
        .from('documents')
        .select('id, landlord_id, type, file_url, uploaded_at')
        .eq('landlord_id', id)
        .order('uploaded_at', { ascending: false }),
      this.supabaseService.client
        .from('admin_actions')
        .select('id, landlord_id, admin_id, action, remarks, created_at')
        .eq('landlord_id', id)
        .order('created_at', { ascending: false })
    ]);

    if (documentsError) {
      throw documentsError;
    }

    if (actionsError) {
      throw actionsError;
    }

    return {
      landlord: landlord as LandlordRecord,
      documents: (documents || []) as LandlordDocument[],
      actions: (actions || []) as AdminActionLog[]
    };
  }

  async getLandlordVerificationSummary(id: string): Promise<LandlordVerificationSummary | null> {
    const { data, error } = await this.supabaseService.client
      .from('landlords')
      .select('status, is_active')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return null;
    }

    return {
      status: data.status as LandlordVerificationStatus,
      is_active: Boolean(data.is_active)
    };
  }

  async approveLandlord(id: string): Promise<{ emailSent: boolean; notificationError?: string }> {
    const { landlord, documents } = await this.getLandlordById(id);
    this.assertActionAllowed(landlord, 'approved');

    const missingDocumentTypes = this.getMissingDocumentTypes(documents);
    if (missingDocumentTypes.length > 0) {
      throw new Error(`Approval blocked. Missing documents: ${missingDocumentTypes.join(', ')}`);
    }

    const adminId = await this.getCurrentAdminId();

    const { error: updateError } = await this.supabaseService.client
      .from('landlords')
      .update({
        status: 'approved',
        is_active: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('status', 'pending');

    if (updateError) {
      throw updateError;
    }

    const { error: actionError } = await this.supabaseService.client
      .from('admin_actions')
      .insert({
        landlord_id: id,
        admin_id: adminId,
        action: 'approved',
        remarks: null
      });

    if (actionError) {
      throw actionError;
    }

    return this.sendVerificationNotification(id, 'approved', 'Your account has been verified and activated.');
  }

  async rejectLandlord(id: string, reason: string): Promise<{ emailSent: boolean; notificationError?: string }> {
    const remarks = reason.trim();
    if (!remarks) {
      throw new Error('Rejection reason is required.');
    }

    const { landlord } = await this.getLandlordById(id);
    this.assertActionAllowed(landlord, 'rejected');

    const adminId = await this.getCurrentAdminId();

    const { error: updateError } = await this.supabaseService.client
      .from('landlords')
      .update({
        status: 'rejected',
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('status', 'pending');

    if (updateError) {
      throw updateError;
    }

    const { error: actionError } = await this.supabaseService.client
      .from('admin_actions')
      .insert({
        landlord_id: id,
        admin_id: adminId,
        action: 'rejected',
        remarks
      });

    if (actionError) {
      throw actionError;
    }

    return this.sendVerificationNotification(id, 'rejected', remarks);
  }

  async requestResubmission(id: string, remarks: string): Promise<{ emailSent: boolean; notificationError?: string }> {
    const note = remarks.trim();
    if (!note) {
      throw new Error('Resubmission remarks are required.');
    }

    const { landlord } = await this.getLandlordById(id);
    this.assertActionAllowed(landlord, 'resubmission_requested');

    const adminId = await this.getCurrentAdminId();

    const { error: updateError } = await this.supabaseService.client
      .from('landlords')
      .update({
        status: 'resubmission_required',
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('status', 'pending');

    if (updateError) {
      throw updateError;
    }

    const { error: actionError } = await this.supabaseService.client
      .from('admin_actions')
      .insert({
        landlord_id: id,
        admin_id: adminId,
        action: 'resubmission_requested',
        remarks: note
      });

    if (actionError) {
      throw actionError;
    }

    return this.sendVerificationNotification(id, 'resubmission_requested', note);
  }

  async getSignedDocumentUrl(filePath: string): Promise<string> {
    if (!filePath) {
      throw new Error('Document path is empty.');
    }

    if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
      return filePath;
    }

    const { data, error } = await this.supabaseService.client
      .storage
      .from('landlord-documents')
      .createSignedUrl(filePath, 60 * 60);

    if (error || !data?.signedUrl) {
      throw error || new Error('Unable to generate document URL.');
    }

    return data.signedUrl;
  }

  watchLandlordQueue(onQueueChange: () => void): { unsubscribe: () => void } {
    const channel = this.supabaseService.client
      .channel('admin-landlord-verification-queue')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'landlords' }, () => {
        onQueueChange();
      })
      .subscribe();

    return {
      unsubscribe: () => {
        void this.supabaseService.client.removeChannel(channel);
      }
    };
  }

  private async getCurrentAdminId(): Promise<string> {
    const user = await this.supabaseService.getCurrentUser();

    if (!user?.id) {
      throw new Error('Admin session not found. Please sign in again.');
    }

    return user.id;
  }

  private assertActionAllowed(landlord: LandlordRecord, targetAction: AdminVerificationAction): void {
    if (landlord.status === 'resubmission_required') {
      throw new Error('Waiting for landlord resubmission. Admin actions are available only when status is pending.');
    }

    if (landlord.status === 'approved' || landlord.status === 'rejected') {
      throw new Error('This verification request is already finalized.');
    }

    if (landlord.status !== 'pending') {
      throw new Error(`Unsupported verification state for action ${targetAction}.`);
    }
  }

  private getMissingDocumentTypes(documents: LandlordDocument[]): LandlordDocumentType[] {
    const existingTypes = new Set(documents.map((document) => document.type));
    return this.requiredDocumentTypes.filter((requiredType) => !existingTypes.has(requiredType));
  }

  private async sendVerificationNotification(
    landlordId: string,
    action: AdminVerificationAction,
    remarks: string
  ): Promise<{ emailSent: boolean; notificationError?: string }> {
    try {
      const { data, error } = await this.supabaseService.client.functions.invoke('landlord-verification-notify', {
        body: {
          landlord_id: landlordId,
          action,
          remarks
        }
      });

      if (error) {
        throw error;
      }

      if (data && typeof data === 'object' && 'success' in data && data.success !== true) {
        throw new Error('Notification function returned an unexpected response.');
      }

      return { emailSent: true };
    } catch (error) {
      const notificationError = error instanceof Error ? error.message : 'Unknown email notification error';
      console.warn('Notification function failed:', notificationError);
      return { emailSent: false, notificationError };
    }
  }
}
