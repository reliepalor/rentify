import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Profile } from '../../shared/models/profile.model';

@Injectable({
  providedIn: 'root'
})
export class ProfileService {

  constructor(private supabaseService: SupabaseService) {}

  async getProfile(): Promise<Profile | null> {

    const user = await this.supabaseService.client.auth.getUser();

    const { data, error } = await this.supabaseService.client
      .from('profiles')
      .select('*')
      .eq('id', user.data.user?.id)
      .single();

    if (error) {
      console.error(error);
      return null;
    }

    return data as Profile;
  }
}