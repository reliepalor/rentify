import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class LoadingService {
  readonly visible = signal(false);
  readonly message = signal('Please wait...');

  show(message = 'Please wait...'): void {
    this.message.set(message);
    this.visible.set(true);
  }

  hide(): void {
    this.visible.set(false);
  }
}
