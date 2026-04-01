import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { SupabaseService } from '../../../core/services/supabase.service';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin-dashboard.html'
})
export class AdminDashboard {

  constructor(
    private supabaseService: SupabaseService,
    private router: Router
  ) {}

  async logout() {
    await this.supabaseService.client.auth.signOut();
    this.router.navigate(['/landing']);
  }
}