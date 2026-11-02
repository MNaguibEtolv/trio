/**
 * Menu configuration for `ui-context-menu`. Same shape as the portal's
 * `contextMenuItem`, so existing menus work unchanged.
 */

/** Runs when an item is chosen; receives the `row` / `index` the menu was opened with. */
export type ContextMenuAction = (row: any, index: number) => void;

export interface contextMenu {
  ClassCSS?: string;
  SytleCSS?: string;
  /** Raw HTML icon. */
  DiffIcon?: string;
  IconStyle?: string;
  /** A `ui-icon` name (built-in or registered with provideUiIcons). */
  SvgIcon?: string;
  /** Icon class(es) for an `<i>`, for icon fonts. */
  Icon?: string;
  ClassIcon?: string;
  /** Children are shown flattened into the same menu. */
  SubMenu?: Record<string, contextMenu | ContextMenuAction>;
  Action?: ContextMenuAction;
  StyleDiv?: string;
}

/** Label (or translation key) → item, or a bare action. */
export type contextMenuItem = Record<string, contextMenu | ContextMenuAction | string>;

/** Where and with what the menu is open; `null` closes it. */
export interface ContextMenuState {
  menu: contextMenuItem;
  /** Viewport coordinates, e.g. `event.clientX` / `clientY`. */
  x: number;
  y: number;
  /** Passed back to every action. */
  row?: any;
  index?: number;
}
