import { Component, input } from '@angular/core';

export type BadgeVariant = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

@Component({
  selector: 'ui-badge',
  host: { '[class]': '"ui-badge--" + variant()' },
  styles: `
    :host {
      display: inline-block;
      padding: 0.125rem 0.5rem;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 600;
    }
    :host(.ui-badge--neutral) {
      background: #f3f4f6;
      color: #374151;
    }
    :host(.ui-badge--success) {
      background: #dcfce7;
      color: #166534;
    }
    :host(.ui-badge--warning) {
      background: #fef3c7;
      color: #92400e;
    }
    :host(.ui-badge--danger) {
      background: #fee2e2;
      color: #991b1b;
    }
    :host(.ui-badge--info) {
      background: #dbeafe;
      color: #1e40af;
    }
  `,
  template: `<ng-content />`,
})
export class Badge {
  readonly variant = input<BadgeVariant>('neutral');
}
