import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: number;
  type: ToastType;
  message: string;
  duration: number;
}

@Injectable({
  providedIn: 'root'
})
export class ToastService {
  private readonly nextId = signal(1);
  readonly toasts = signal<ToastMessage[]>([]);

  show(type: ToastType, message: string, duration = 3000): void {
    const id = this.nextId();
    this.nextId.set(id + 1);

    this.toasts.update((current) => [
      ...current,
      { id, type, message, duration }
    ]);

    window.setTimeout(() => this.dismiss(id), duration);
  }

  success(message: string, duration = 3000): void {
    this.show('success', message, duration);
  }

  error(message: string, duration = 3500): void {
    this.show('error', message, duration);
  }

  info(message: string, duration = 3000): void {
    this.show('info', message, duration);
  }

  dismiss(id: number): void {
    this.toasts.update((current) => current.filter((toast) => toast.id !== id));
  }
}
