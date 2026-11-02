import { EnvironmentProviders, InjectionToken, makeEnvironmentProviders } from '@angular/core';

/**
 * Icon set for `ui-icon`. Each icon is the list of path `d` strings for one
 * 24×24 drawing, stroked with `currentColor` — so icons take the text colour
 * and follow the light / dark tokens.
 *
 * Circles are written as two arcs: `M cx-r cy a r r 0 1 0 2r 0 a r r 0 1 0 -2r 0`.
 */
export type UiIconSet = Record<string, readonly string[]>;

export const UI_ICONS = {
  // actions
  edit: ['M4 20h4L19 9a2.83 2.83 0 0 0-4-4L4 16v4z', 'M13.5 6.5l4 4'],
  delete: ['M4 7h16', 'M10 11v6', 'M14 11v6', 'M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12', 'M9 7V4h6v3'],
  plus: ['M12 5v14', 'M5 12h14'],
  minus: ['M5 12h14'],
  check: ['M5 12l5 5L20 7'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  search: ['M4 11a7 7 0 1 0 14 0a7 7 0 1 0-14 0', 'M20 20l-4-4'],
  reload: ['M20 12a8 8 0 1 1-2.34-5.66', 'M20 4v5h-5'],
  download: ['M12 4v11', 'M7 10l5 5 5-5', 'M5 20h14'],
  filter: ['M4 5h16l-6 7v6l-4 2v-8L4 5z'],
  eye: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z', 'M9 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0'],
  calendar: ['M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7z', 'M4 10h16', 'M8 3v4', 'M16 3v4'],
  'more-vertical': [
    'M11 5a1 1 0 1 0 2 0a1 1 0 1 0-2 0',
    'M11 12a1 1 0 1 0 2 0a1 1 0 1 0-2 0',
    'M11 19a1 1 0 1 0 2 0a1 1 0 1 0-2 0',
  ],
  'more-horizontal': [
    'M4 12a1 1 0 1 0 2 0a1 1 0 1 0-2 0',
    'M11 12a1 1 0 1 0 2 0a1 1 0 1 0-2 0',
    'M18 12a1 1 0 1 0 2 0a1 1 0 1 0-2 0',
  ],

  // direction
  'chevron-down': ['M6 9l6 6 6-6'],
  'chevron-up': ['M6 15l6-6 6 6'],
  'chevron-left': ['M15 6l-6 6 6 6'],
  'chevron-right': ['M9 6l6 6-6 6'],
  'arrow-up': ['M12 19V5', 'M5 12l7-7 7 7'],
  'arrow-down': ['M12 5v14', 'M19 12l-7 7-7-7'],
  'arrow-left': ['M19 12H5', 'M12 19l-7-7 7-7'],
  'arrow-right': ['M5 12h14', 'M12 5l7 7-7 7'],
} as const satisfies UiIconSet;

export type UiIconName = keyof typeof UI_ICONS;

/** Extra icon sets registered by apps; later sets override earlier names. */
export const UI_ICON_SETS = new InjectionToken<UiIconSet[]>('UI_ICON_SETS', {
  factory: () => [],
});

/**
 * Adds an app's own icons, drawn on the same 24×24 stroked grid:
 *
 *   providers: [provideUiIcons({ plane: ['M2 16l20-6-20-6 4 6-4 6z'] })]
 *
 * then `<ui-icon name="plane" />`.
 */
export function provideUiIcons(icons: UiIconSet): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: UI_ICON_SETS, useValue: icons, multi: true }]);
}
