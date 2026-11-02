import { InjectionToken, Pipe, PipeTransform, inject } from '@angular/core';

/**
 * Turns a label key into display text. The shared UI has no i18n library of its
 * own; an app plugs in its translator once, e.g. with ngx-translate:
 *
 *   { provide: UI_TRANSLATE, useFactory: () => {
 *       const t = inject(TranslateService);
 *       return (key: string) => t.instant(key);
 *   } }
 *
 * The default returns the key unchanged.
 */
export const UI_TRANSLATE = new InjectionToken<(key: string) => string>('UI_TRANSLATE', {
  factory: () => (key: string) => key,
});

/** Impure so a language switch shows up without the caller rebinding anything. */
@Pipe({ name: 'uiTranslate', pure: false })
export class UiTranslatePipe implements PipeTransform {
  private readonly translate = inject(UI_TRANSLATE);

  transform(key: unknown): string {
    if (key === null || key === undefined || key === '') {
      return '';
    }
    const text = this.translate(`${key}`);
    // A key that collides with a translation group comes back as an object.
    return typeof text === 'string' ? text : `${key}`;
  }
}
