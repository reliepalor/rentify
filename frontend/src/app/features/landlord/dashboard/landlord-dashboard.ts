import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { SupabaseService } from '../../../core/services/supabase.service';

@Component({
  selector: 'app-landlord-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './landlord-dashboard.html'
})
export class LandlordDashboard {

  constructor(
    private supabaseService: SupabaseService,
    private router: Router
  ) {}

  async logout() {
    await this.supabaseService.client.auth.signOut();
    this.router.navigate(['/landing']);
  }
}