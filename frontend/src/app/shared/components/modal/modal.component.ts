import { CommonModule } from '@angular/common';
import { Component, HostListener, inject } from '@angular/core';
import { ModalService, ModalType } from '../../services/modal.service';

@Component({
  selector: 'app-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './modal.component.html'
})
export class ModalComponent {
  readonly modalService = inject(ModalService);

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.modalService.state().isOpen) {
      this.modalService.close();
    }
  }

  getContainerClasses(type: ModalType): string {
    if (type === 'success') {
      return 'border-emerald-200';
    }

    if (type === 'error') {
      return 'border-red-200';
    }

    return 'border-blue-200';
  }

  getIcon(type: ModalType): string {
    if (type === 'success') return '✓';
    if (type === 'error') return '!';
    return 'i';
  }

  getIconClasses(type: ModalType): string {
    if (type === 'success') {
      return 'bg-emerald-100 text-emerald-700';
    }

    if (type === 'error') {
      return 'bg-red-100 text-red-700';
    }

    return 'bg-blue-100 text-blue-700';
  }

  close(): void {
    this.modalService.close();
  }
}
