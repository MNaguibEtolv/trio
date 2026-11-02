import { ChangeDetectionStrategy, Component, computed, inject, input, isDevMode } from '@angular/core';
import { UI_ICONS, UI_ICON_SETS, UiIconName } from './icons';

/**
 * Inline SVG icon. Takes the surrounding text colour; set `color` to change it.
 *
 *   <ui-icon name="edit" />
 *   <ui-icon name="delete" size="18" style="color: var(--ui-danger)" />
 *   <ui-icon name="search" label="Search" />   (announced to screen readers)
 */
@Component({
  selector: 'ui-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'ui-icon',
    '[attr.role]': 'label() ? "img" : null',
    '[attr.aria-label]': 'label() || null',
    '[attr.aria-hidden]': 'label() ? null : "true"',
    '[style.width]': 'dimension()',
    '[style.height]': 'dimension()',
  },
  styles: `
    :host {
      display: inline-flex;
      flex-shrink: 0;
      vertical-align: -0.125em;
    }
    svg {
      width: 100%;
      height: 100%;
    }
  `,
  template: `
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      [attr.stroke-width]="strokeWidth()"
    >
      @for (d of paths(); track $index) {
        <path [attr.d]="d" />
      }
    </svg>
  `,
})
export class Icon {
  private readonly extraSets = inject(UI_ICON_SETS);

  /** A built-in icon, or one registered with `provideUiIcons`. */
  readonly name = input.required<UiIconName | (string & {})>();
  /** Number = px; a string is used as-is. Default follows the font size. */
  readonly size = input<number | string>('1em');
  readonly strokeWidth = input(2);
  /** Accessible name. Without one the icon is decorative and hidden from screen readers. */
  readonly label = input('');

  protected readonly dimension = computed(() => {
    const size = this.size();
    return typeof size === 'number' || /^\d+(\.\d+)?$/.test(size) ? `${size}px` : size;
  });

  protected readonly paths = computed<readonly string[]>(() => {
    const name = this.name();
    for (let i = this.extraSets.length - 1; i >= 0; i--) {
      if (this.extraSets[i][name]) {
        return this.extraSets[i][name];
      }
    }
    const icon = (UI_ICONS as Record<string, readonly string[]>)[name];
    if (!icon && isDevMode()) {
      console.warn(`ui-icon: unknown icon "${name}"`);
    }
    return icon ?? [];
  });
}
