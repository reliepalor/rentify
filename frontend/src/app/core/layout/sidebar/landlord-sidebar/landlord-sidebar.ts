import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { SupabaseService } from '../../../services/supabase.service';

@Component({
  selector: 'app-landlord-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './landlord-sidebar.html'
})
export class LandlordSidebarComponent {
  @Input() isCollapsed = false;

  constructor(
    private supabaseService: SupabaseService,
    private router: Router
  ) {}

  async logout() {
    try {
      await this.supabaseService.client.auth.signOut();
      await this.router.navigate(['/login']);
    } catch (error) {
      console.error('Logout error:', error);
    }
  }
}