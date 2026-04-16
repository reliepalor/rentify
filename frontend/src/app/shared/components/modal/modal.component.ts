import { CommonModule } from '@angular/common';
import { Component, HostListener, OnDestroy, effect, inject, signal } from '@angular/core';
import { ModalService, ModalType } from '../../services/modal.service';

@Component({
  selector: 'app-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './modal.component.html',
  styles: [
    `
      .modal-shell {
        background:
          radial-gradient(circle at top right, rgba(255, 255, 255, 0.96), rgba(255, 255, 255, 0.92)),
          linear-gradient(140deg, rgba(15, 23, 42, 0.04), rgba(30, 41, 59, 0.01));
      }

      .modal-shell::before {
        content: '';
        position: absolute;
        inset: 0;
        pointer-events: none;
        background:
          linear-gradient(120deg, rgba(148, 163, 184, 0.1), transparent 38%),
          linear-gradient(300deg, rgba(30, 64, 175, 0.07), transparent 45%);
      }

      .modal-icon-enter {
        animation: modal-icon-pop 0.72s cubic-bezier(0.22, 1, 0.36, 1);
      }

      .modal-ring-enter {
        animation: modal-ring-pop 0.9s cubic-bezier(0.22, 1, 0.36, 1);
      }

      .modal-icon-wrap {
        margin-top: 2px;
      }

      .modal-icon-wrap-enter {
        animation: modal-icon-wrap-drift 0.85s cubic-bezier(0.22, 1, 0.36, 1);
      }

      .modal-icon-glow {
        position: absolute;
        inset: -14px;
        border-radius: 9999px;
        background: radial-gradient(circle, rgba(148, 163, 184, 0.23) 0%, rgba(148, 163, 184, 0) 70%);
        filter: blur(1px);
        opacity: 0.7;
      }

      .modal-glyph-enter path {
        stroke-dasharray: 30;
        stroke-dashoffset: 30;
        animation: modal-glyph-draw 0.65s cubic-bezier(0.16, 1, 0.3, 1) 0.08s forwards;
      }

      @keyframes modal-icon-pop {
        0% {
          transform: scale(0.72) translateY(10px) translateX(-6px);
          opacity: 0;
        }
        55% {
          transform: scale(1.03) translateY(-2px) translateX(2px);
          opacity: 1;
        }
        100% {
          transform: scale(1) translateY(0);
          opacity: 1;
        }
      }

      @keyframes modal-ring-pop {
        0% {
          transform: scale(0.7);
          opacity: 0;
        }
        50% {
          opacity: 0.3;
        }
        100% {
          transform: scale(1.12);
          opacity: 0;
        }
      }

      @keyframes modal-glyph-draw {
        to {
          stroke-dashoffset: 0;
        }
      }

      @keyframes modal-icon-wrap-drift {
        0% {
          transform: translateY(8px);
          opacity: 0;
        }
        50% {
          transform: translateY(-3px);
          opacity: 1;
        }
        100% {
          transform: translateY(0);
          opacity: 1;
        }
      }
    `
  ]
})
export class ModalComponent implements OnDestroy {
  readonly modalService = inject(ModalService);
  readonly shouldRender = signal(false);
  readonly isVisible = signal(false);
  private closeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      const open = this.modalService.state().isOpen;

      if (open) {
        this.clearCloseTimer();
        this.shouldRender.set(true);
        requestAnimationFrame(() => this.isVisible.set(true));
        return;
      }

      if (this.shouldRender()) {
        this.isVisible.set(false);
        this.closeTimer = setTimeout(() => {
          this.shouldRender.set(false);
        }, 360);
      }
    });
  }

  ngOnDestroy(): void {
    this.clearCloseTimer();
  }

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

  getIconLabel(type: ModalType): string {
    if (type === 'success') return 'Success';
    if (type === 'error') return 'Error';
    return 'Info';
  }

  hasTable(): boolean {
    return !!this.modalService.state().table;
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

  private clearCloseTimer(): void {
    if (this.closeTimer) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
  }

  formatCellValue(value: unknown): string {
    if (value === null || value === undefined || value === '') return 'N/A';
    return String(value);
  }
}
