import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
  duration?: number;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private toasts = signal<Toast[]>([]);
  activeToasts = this.toasts.asReadonly();

  show(toast: Omit<Toast, 'id'>) {
    const id = crypto.randomUUID();
    const newToast: Toast = { ...toast, id };
    this.toasts.update(current => [...current, newToast].slice(-3));

    const duration = toast.duration ?? 5000;
    setTimeout(() => this.dismiss(id), duration);
  }

  success(title: string, message?: string) {
    this.show({ type: 'success', title, message });
  }

  error(title: string, message?: string) {
    this.show({ type: 'error', title, message });
  }

  warning(title: string, message?: string) {
    this.show({ type: 'warning', title, message });
  }

  info(title: string, message?: string) {
    this.show({ type: 'info', title, message });
  }

  dismiss(id: string) {
    this.toasts.update(current => current.filter(t => t.id !== id));
  }
}
