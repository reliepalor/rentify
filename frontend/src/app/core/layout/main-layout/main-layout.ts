import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, ActivatedRoute, Router } from '@angular/router';
import { AdminSidebarComponent } from '../sidebar/admin-sidebar/admin-sidebar';
import { LandlordSidebarComponent } from '../sidebar/landlord-sidebar/landlord-sidebar';
import { SupabaseService } from '../../services/supabase.service';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    AdminSidebarComponent,
    LandlordSidebarComponent
  ],
  templateUrl: './main-layout.html'
})
export class MainLayoutComponent implements OnInit {

  role: 'admin' | 'landlord' = 'landlord';
  isSidebarCollapsed = false;

  constructor(
    private route: ActivatedRoute,
    private supabaseService: SupabaseService,
    private router: Router
  ) {}

  ngOnInit() {
    // Get role from route data
    this.route.data.subscribe(data => {
      if (data['role']) {
        this.role = data['role'];
      }
    });
  }

  toggleSidebar() {
    this.isSidebarCollapsed = !this.isSidebarCollapsed;
  }

  async logout() {
    try {
      await this.supabaseService.client.auth.signOut();
      this.router.navigate(['/landing']);
    } catch (error) {
      console.error('Logout error:', error);
    }
  }
}