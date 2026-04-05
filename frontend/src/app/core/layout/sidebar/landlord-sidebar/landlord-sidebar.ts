import { Component, Input, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { SupabaseService } from '../../../services/supabase.service';

@Component({
  selector: 'app-landlord-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './landlord-sidebar.html'
})
export class LandlordSidebarComponent implements OnInit {
  @Input() isCollapsed = false;
  landlordName = signal('Landlord');

  constructor(
    private supabaseService: SupabaseService,
    private router: Router
  ) {}

  async ngOnInit() {
    try {
      const profile = await this.supabaseService.getCurrentProfile();
      const fullName = profile?.full_name?.trim();
      if (fullName) {
        this.landlordName.set(fullName);
      }
    } catch (error) {
      console.error('Unable to load landlord name:', error);
    }
  }

  async logout() {
    try {
      await this.supabaseService.client.auth.signOut();
      await this.router.navigate(['/landing']);
    } catch (error) {
      console.error('Logout error:', error);
    }
  }
}