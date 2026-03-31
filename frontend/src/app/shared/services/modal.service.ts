import { Injectable, signal } from '@angular/core';

export type ModalType = 'info' | 'success' | 'error';

export interface ModalState {
  isOpen: boolean;
  type: ModalType;
  title: string;
  message: string;
  confirmText: string;
}

@Injectable({
  providedIn: 'root'
})
export class ModalService {
  readonly state = signal<ModalState>({
    isOpen: false,
    type: 'info',
    title: '',
    message: '',
    confirmText: 'OK'
  });

  open(config: {
    type?: ModalType;
    title: string;
    message: string;
    confirmText?: string;
  }): void {
    this.state.set({
      isOpen: true,
      type: config.type ?? 'info',
      title: config.title,
      message: config.message,
      confirmText: config.confirmText ?? 'OK'
    });
  }

  close(): void {
    this.state.update((current) => ({ ...current, isOpen: false }));
  }

  error(title: string, message: string, confirmText = 'OK'): void {
    this.open({ type: 'error', title, message, confirmText });
  }

  success(title: string, message: string, confirmText = 'OK'): void {
    this.open({ type: 'success', title, message, confirmText });
  }

  info(title: string, message: string, confirmText = 'OK'): void {
    this.open({ type: 'info', title, message, confirmText });
  }
}
