import { Component, input } from '@angular/core';

@Component({
  selector: 'ui-spinner',
  host: { role: 'status', '[attr.aria-label]': 'label()' },
  styles: `
    :host {
      display: inline-block;
    }
    span {
      display: block;
      border: 3px solid var(--ui-border, #e5e7eb);
      border-top-color: var(--ui-primary, #2563eb);
      border-radius: 50%;
      animation: ui-spin 0.8s linear infinite;
    }
    @keyframes ui-spin {
      to {
        transform: rotate(360deg);
      }
    }
  `,
  template: `<span [style.width.px]="size()" [style.height.px]="size()"></span>`,
})
export class Spinner {
  readonly size = input(32);
  readonly label = input('Loading');
}
