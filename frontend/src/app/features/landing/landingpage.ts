import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TenantHeaderComponent } from '../../shared/components/header/tenant-header.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, FormsModule, TenantHeaderComponent],
  templateUrl: './landingpage.html'
})
export class LandingComponent {
  checkInDate: string = '';
  checkOutDate: string = '';
  guests: number = 2;

  onSearch() {
    console.log('Search:', {
      checkIn: this.checkInDate,
      checkOut: this.checkOutDate,
      guests: this.guests
    });
    // Add your search logic here
  }

  exploreAccommodations() {
    // Navigate to accommodations section
    console.log('Explore accommodations clicked');
  }

  learnMore() {
    // Navigate to about section
    console.log('Learn more clicked');
  }
}