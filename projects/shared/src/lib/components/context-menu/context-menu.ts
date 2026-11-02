import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  computed,
  effect,
  inject,
  input,
  output,
} from '@angular/core';
import { UiSafeHtmlPipe } from '../../core/safe-html';
import { UiTranslatePipe } from '../../core/translate';
import { Icon } from '../../icons/icon';
import { ContextMenuAction, ContextMenuState, contextMenu } from './context-menu.types';

interface MenuEntry {
  label: string;
  item: contextMenu;
}

/**
 * A menu that opens at a point on screen — right-click menus, ⋮ buttons.
 * Flips to stay on screen near the edges, and closes on an outside click,
 * Escape, scroll or resize.
 *
 *   <div (contextmenu)="$event.preventDefault();
 *        menu.set({ menu: items, x: $event.clientX, y: $event.clientY, row })">
 *   <ui-context-menu [state]="menu()" (closed)="menu.set(null)" />
 */
@Component({
  selector: 'ui-context-menu',
  imports: [Icon, UiSafeHtmlPipe, UiTranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (state(); as s) {
      <div
        class="ui-context-menu"
        role="menu"
        [style.left.px]="position().left"
        [style.top.px]="position().top"
        [style.right.px]="position().right"
        [style.bottom.px]="position().bottom"
        (contextmenu)="$event.preventDefault()"
      >
        @for (entry of entries(); track entry.label) {
          <button
            type="button"
            role="menuitem"
            class="ui-context-menu__item"
            [class]="entry.item.ClassIcon ?? ''"
            [style]="entry.item.StyleDiv ?? ''"
            (click)="run(entry.item, s)"
          >
            @if (entry.item.DiffIcon) {
              <span class="ui-context-menu__icon" [innerHTML]="entry.item.DiffIcon | uiSafeHtml"></span>
            } @else if (entry.item.SvgIcon) {
              <ui-icon
                class="ui-context-menu__icon"
                size="16"
                [name]="entry.item.SvgIcon"
                [style]="entry.item.IconStyle ?? ''"
              />
            } @else if (entry.item.Icon) {
              <i class="ui-context-menu__icon" [class]="entry.item.Icon" [style]="entry.item.IconStyle ?? ''"></i>
            }
            <span [class]="entry.item.ClassCSS ?? ''" [style]="entry.item.SytleCSS ?? ''">
              {{ entry.label | uiTranslate }}
            </span>
          </button>
        }
      </div>
    }
  `,
  styles: `
    .ui-context-menu {
      position: fixed;
      z-index: var(--ui-z-overlay, 1300);
      min-width: 180px;
      max-height: 70vh;
      overflow-y: auto;
      padding: 4px;
      border: 1px solid var(--ui-border, rgba(20, 34, 67, 0.12));
      border-radius: 10px;
      background: var(--ui-surface, #fff);
      box-shadow: var(--ui-shadow, 0 12px 34px rgba(17, 30, 62, 0.11));
    }
    .ui-context-menu__item {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      padding: 7px 10px;
      border: 0;
      border-radius: 6px;
      background: none;
      color: var(--ui-text, #0b1324);
      font: inherit;
      font-size: 0.8125rem;
      text-align: start;
      cursor: pointer;
    }
    .ui-context-menu__item:hover,
    .ui-context-menu__item:focus-visible {
      background: var(--ui-table-row-hover-bg, #e4edff);
      outline: none;
    }
    .ui-context-menu__icon {
      display: inline-flex;
      width: 16px;
      justify-content: center;
      color: var(--ui-text-muted, #4b5a75);
    }
  `,
})
export class ContextMenu {
  private readonly document = inject(DOCUMENT);

  readonly state = input<ContextMenuState | null>(null);
  readonly closed = output<void>();

  /** SubMenu groups are flattened into the one list, as in the portal. */
  protected readonly entries = computed<MenuEntry[]>(() => {
    const menu = this.state()?.menu;
    if (!menu) {
      return [];
    }
    const entries: MenuEntry[] = [];
    const add = (label: string, value: contextMenu | ContextMenuAction | string) => {
      if (typeof value === 'function') {
        entries.push({ label, item: { Action: value } });
      } else if (value && typeof value === 'object') {
        if (value.SubMenu) {
          Object.entries(value.SubMenu).forEach(([sub, child]) => add(sub, child));
        } else {
          entries.push({ label, item: value });
        }
      }
    };
    Object.entries(menu).forEach(([label, value]) => {
      if (label !== 'StyleMainDivMainMenu') {
        add(label, value);
      }
    });
    return entries;
  });

  /** Anchor to the far edge when the point is in the last third of the screen. */
  protected readonly position = computed(() => {
    const s = this.state();
    const view = this.document.defaultView;
    const width = view?.innerWidth ?? 0;
    const height = view?.innerHeight ?? 0;
    if (!s) {
      return { left: null, top: null, right: null, bottom: null };
    }
    const nearRight = width - s.x < width / 3;
    const nearBottom = height - s.y < height / 3;
    return {
      left: nearRight ? null : Math.max(8, s.x),
      right: nearRight ? Math.max(8, width - s.x) : null,
      top: nearBottom ? null : Math.max(8, s.y),
      bottom: nearBottom ? Math.max(8, height - s.y) : null,
    };
  });

  constructor() {
    // Close on any click outside, Escape, scroll or resize while open.
    effect((onCleanup) => {
      if (!this.state()) {
        return;
      }
      if (this.entries().length === 0) {
        queueMicrotask(() => this.closed.emit());
        return;
      }
      const view = this.document.defaultView;
      const close = () => this.closed.emit();
      const onPointer = (event: Event) => {
        if (!(event.target as Element | null)?.closest?.('.ui-context-menu')) {
          close();
        }
      };
      const onKey = (event: KeyboardEvent) => event.key === 'Escape' && close();
      const onScroll = (event: Event) => {
        if (!(event.target as Element | null)?.closest?.('.ui-context-menu')) {
          close();
        }
      };
      // Attach after the opening event has finished bubbling.
      const timer = setTimeout(() => {
        this.document.addEventListener('mousedown', onPointer, true);
        this.document.addEventListener('contextmenu', onPointer, true);
        this.document.addEventListener('keydown', onKey, true);
        this.document.addEventListener('scroll', onScroll, true);
        view?.addEventListener('resize', close);
      });
      onCleanup(() => {
        clearTimeout(timer);
        this.document.removeEventListener('mousedown', onPointer, true);
        this.document.removeEventListener('contextmenu', onPointer, true);
        this.document.removeEventListener('keydown', onKey, true);
        this.document.removeEventListener('scroll', onScroll, true);
        view?.removeEventListener('resize', close);
      });
    });
  }

  protected run(item: contextMenu, state: ContextMenuState): void {
    item.Action?.(state.row, state.index ?? -1);
    this.closed.emit();
  }
}
