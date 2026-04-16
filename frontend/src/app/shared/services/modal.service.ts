import { Injectable, signal } from '@angular/core';

export type ModalType = 'info' | 'success' | 'error';

export interface ModalTableColumn {
  key: string;
  label: string;
}

export interface ModalTableConfig {
  columns: ModalTableColumn[];
  rows: Record<string, unknown>[];
  emptyMessage?: string;
}

export interface ModalState {
  isOpen: boolean;
  type: ModalType;
  title: string;
  message: string;
  confirmText: string;
  table: ModalTableConfig | null;
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
    confirmText: 'OK',
    table: null
  });

  open(config: {
    type?: ModalType;
    title: string;
    message: string;
    confirmText?: string;
    table?: ModalTableConfig | null;
  }): void {
    this.state.set({
      isOpen: true,
      type: config.type ?? 'info',
      title: config.title,
      message: config.message,
      confirmText: config.confirmText ?? 'OK',
      table: config.table ?? null
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
