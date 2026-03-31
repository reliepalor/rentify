import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ToastMessage, ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './toast.component.html'
})
export class ToastComponent {
  readonly toastService = inject(ToastService);

  trackByToastId(_: number, toast: ToastMessage): number {
    return toast.id;
  }

  getToastClasses(type: 'success' | 'error' | 'info'): string {
    if (type === 'success') {
      return 'bg-emerald-600 text-white';
    }

    if (type === 'error') {
      return 'bg-red-600 text-white';
    }

    return 'bg-slate-800 text-white';
  }
}
