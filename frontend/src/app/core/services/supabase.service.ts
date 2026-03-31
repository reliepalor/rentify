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
      return null;
    }

    // Try to fetch all columns from profiles table for this user
    try {
      const { data, error, status } = await this.supabase
        .from('profiles')
        .select('id, role, full_name, contact_number, address, profile_picture, created_at, updated_at')
        .eq('id', user.id)
        .single();

      if (error || status >= 400) {
        console.error('Profile verification failed.');
      }

      return data;
    } catch (err) {
      console.error('Profile verification failed.');
      return null;
    }
  }

  // Helper to get current profile (with role)
  async getCurrentProfile() {
    const user = await this.getCurrentUser();
    if (!user) return null;

    try {
      const { data, error } = await this.supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) {
        console.error('Unable to load profile from database.');

        // Fallback: return role from user metadata
        const metadataRole = user.user_metadata?.['role'] as string;
        
        return {
          id: user.id,
          role: (metadataRole || 'tenant').toLowerCase().trim(),
          full_name: user.user_metadata?.['full_name'] || '',
          created_at: user.created_at
        };
      }

      // Profile query succeeded
      // Ensure role is a string, lowercase, and trimmed
      if (data?.role && typeof data.role === 'string') {
        data.role = data.role.toLowerCase().trim();
      } else if (data?.role) {
        console.error('Invalid profile role format.');
        data.role = 'tenant'; // Fallback
      }
      
      return data;
    } catch (err) {
      console.error('Unable to load profile from database.');
      
      // Fallback to metadata
      const metadataRole = user.user_metadata?.['role'] as string;
      
      return {
        id: user.id,
        role: (metadataRole || 'tenant').toLowerCase().trim(),
        full_name: user.user_metadata?.['full_name'] || '',
        created_at: user.created_at
      };
    }
  }

  // Strict profile lookup from database only (no metadata fallback)
  async getCurrentProfileStrict() {
    const user = await this.getCurrentUser();
    if (!user) return null;

    try {
      const { data, error } = await this.supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (error || !data) return null;

      if (typeof data.role !== 'string') return null;

      data.role = data.role.toLowerCase().trim();
      return data;
    } catch {
      return null;
    }
  }
}