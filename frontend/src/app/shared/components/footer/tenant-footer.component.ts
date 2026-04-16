import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-tenant-footer',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './tenant-footer.component.html'
})
export class TenantFooterComponent {
  currentYear = new Date().getFullYear();
}
