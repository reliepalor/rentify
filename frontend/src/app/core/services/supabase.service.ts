import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environment';

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(
      environment.supabase.url,
      environment.supabase.anonKey
    );
  }

  get client() {
    return this.supabase;
  }

  // Helper to get current user
  async getCurrentUser() {
    const { data: { user } } = await this.supabase.auth.getUser();
    return user;
  }

  // Debug method - directly verify profile in database
  async verifyProfileInDatabase() {
    const user = await this.getCurrentUser();
    if (!user) {
      console.log('No authenticated user found');
      return null;
    }

    console.log('=== PROFILE VERIFICATION ===');
    console.log('User ID:', user.id);
    console.log('User Email:', user.email);
    console.log('User Metadata:', user.user_metadata);

    // Try to fetch all columns from profiles table for this user
    try {
      const { data, error, status } = await this.supabase
        .from('profiles')
        .select('id, role, full_name, contact_number, address, profile_picture, created_at, updated_at')
        .eq('id', user.id)
        .single();

      console.log('Query Status:', status);
      console.log('Query Error:', error);
      console.log('Query Data:', data);

      if (data) {
        console.log('=== PROFILE FOUND ===');
        console.log('Role from DB:', data.role);
        console.log('Role type:', typeof data.role);
        console.log('Role length:', (data.role as string)?.length);
        console.log('Role hex:', Array.from((data.role as string) || '').map(c => c.charCodeAt(0).toString(16)).join(' '));
      }

      return data;
    } catch (err) {
      console.error('Profile verification exception:', err);
      return null;
    }
  }

  // Helper to get current profile (with role)
  async getCurrentProfile() {
    const user = await this.getCurrentUser();
    if (!user) return null;

    try {
      console.log('Fetching profile for user:', user.id);
      
      const { data, error } = await this.supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) {
        console.error('Profile query error details:', {
          code: error?.code,
          message: error?.message,
          details: error?.details,
          hint: error?.hint
        });

        // If permission error, log it
        if (error?.message?.includes('403') || error?.message?.includes('permission')) {
          console.warn('Permission Denied! User may not have access to their own profile.');
        }

        // Fallback: return role from user metadata
        const metadataRole = user.user_metadata?.['role'] as string;
        console.log('Fallback to metadata role:', metadataRole || 'tenant');
        
        return {
          id: user.id,
          role: (metadataRole || 'tenant').toLowerCase().trim(),
          full_name: user.user_metadata?.['full_name'] || '',
          created_at: user.created_at
        };
      }

      // Profile query succeeded
      console.log('Profile found from database:', data);
      console.log('Database role (raw):', data?.role);
      console.log('Database role (type):', typeof data?.role);
      
      // Ensure role is a string, lowercase, and trimmed
      if (data?.role && typeof data.role === 'string') {
        data.role = data.role.toLowerCase().trim();
        console.log('Database role (cleaned):', data.role);
      } else if (data?.role) {
        console.error('Role is not a string!', typeof data.role, data.role);
        data.role = 'tenant'; // Fallback
      }
      
      return data;
    } catch (err) {
      console.error('Error fetching profile:', err);
      
      // Fallback to metadata
      const metadataRole = user.user_metadata?.['role'] as string;
      console.log('Exception fallback - using metadata role:', metadataRole || 'tenant');
      
      return {
        id: user.id,
        role: (metadataRole || 'tenant').toLowerCase().trim(),
        full_name: user.user_metadata?.['full_name'] || '',
        created_at: user.created_at
      };
    }
  }
}