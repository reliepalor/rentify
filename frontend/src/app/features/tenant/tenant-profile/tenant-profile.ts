import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TenantProfileModal } from '../../../shared/components/base-modal/tenant-profile-modal/tenant-profile-modal';
import { Profile } from '../../../shared/models/type';
import { SupabaseService } from '../../../core/services/supabase.service';

@Component({
  selector: 'app-tenant-profile',
  standalone: true,
  imports: [CommonModule, TenantProfileModal], 
  templateUrl: './tenant-profile.html',
  styleUrl: './tenant-profile.scss',
})
export class TenantProfile implements OnInit {

  isEditMode = false;
  profile: Profile | null = null;
  email: string | undefined;

  constructor(private supabaseService: SupabaseService) {}

  async ngOnInit() {

    const user = await this.supabaseService.getCurrentUser();
    this.email = user?.email;

    this.profile = await this.supabaseService.getCurrentProfile() as Profile;
  }

  openEdit() {
    this.isEditMode = true;
  }

  closeEdit() {
    this.isEditMode = false;
  }

}