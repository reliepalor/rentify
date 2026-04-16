import { Component, EventEmitter, Output } from '@angular/core';

@Component({
  selector: 'app-tenant-profile-modal',
  standalone: true,
  imports: [],
  templateUrl: './tenant-profile-modal.html',
  styleUrl: './tenant-profile-modal.scss',
})
export class TenantProfileModal {
    @Output() close = new EventEmitter<void>();

  closeEdit() {
    this.close.emit();
  }
}
