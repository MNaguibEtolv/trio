import { CdkConnectedOverlay, CdkOverlayOrigin, ConnectedPosition } from '@angular/cdk/overlay';
import {
  CdkFixedSizeVirtualScroll,
  CdkVirtualForOf,
  CdkVirtualScrollViewport,
} from '@angular/cdk/scrolling';
import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  forwardRef,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { outputFromObservable } from '@angular/core/rxjs-interop';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { Subject } from 'rxjs';
import { UI_TRANSLATE, UiTranslatePipe } from '../../core/translate';
import { Icon } from '../../icons/icon';

export type SelectValue = string | number | boolean | null;

/** Emitted when the select needs items from the backend. */
export interface SelectSearchEvent {
  /** The character just typed, '' for scroll / forced searches. */
  lastCharacter: string;
  /** The current search text. */
  text: string;
  page: { offset: number; limit: number };
}

let nextId = 0;

/**
 * Searchable single / multi select with backend paging and virtual scroll.
 *
 * Ported from the portal's `etolv-select-custom`. The option panel is a CDK
 * overlay, so it is always appended to <body> (escapes `overflow: hidden`,
 * tables and modals) and repositions itself on scroll and in RTL.
 */
@Component({
  selector: 'ui-select',
  imports: [
    CdkOverlayOrigin,
    CdkConnectedOverlay,
    CdkVirtualScrollViewport,
    CdkFixedSizeVirtualScroll,
    CdkVirtualForOf,
    Icon,
    NgTemplateOutlet,
    UiTranslatePipe,
  ],
  templateUrl: './select.html',
  styleUrl: './select.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => Select), multi: true }],
  host: {
    class: 'ui-select',
    '[class.ui-select--open]': 'open()',
    '[class.ui-select--disabled]': 'isDisabled()',
  },
})
export class Select implements ControlValueAccessor {
  private readonly translate = inject(UI_TRANSLATE);

  // ── Data ────────────────────────────────────────────────────────────
  readonly items = input<readonly any[]>([]);
  /** Item key shown as the label. Empty = the item itself. */
  readonly optionLabel = input('');
  /** Item key used as the value. Empty = falls back to `optionLabel`. */
  readonly optionValue = input('');
  /** Item key that, when truthy, makes the option unselectable. */
  readonly disabledKey = input('');
  /** Custom match for local filtering. */
  readonly filterFn = input<((text: string, item: any) => boolean) | null>(null);

  // ── Behaviour ───────────────────────────────────────────────────────
  readonly placeholder = input('');
  readonly multiple = input(false);
  readonly allowClear = input(false);
  /** Value restored by the clear button, and applied whenever it changes. */
  readonly defaultValue = input<SelectValue>(null);
  readonly disabled = input(false);
  /** Typed text becomes the value even when it matches no option. */
  readonly autoComplete = input(false);
  /** Send every search to the backend, not only when nothing matches locally. */
  readonly autoSearch = input(false);
  /** Ask the backend when the search text matches no loaded option. */
  readonly searchBackEnd = input(true);
  /** Show a "Search" row that queries the backend on demand. */
  readonly forceSearch = input(false);
  /** Request the next page when the list is scrolled to the end. */
  readonly loadOnScroll = input(false);
  /** Total items on the backend; paging stops once this many are loaded. */
  readonly total = input<number | null>(null);
  readonly loading = input(false);
  /** Merge each new `items` batch into the loaded ones instead of replacing them. */
  readonly keepItems = input(true);
  /** Keep the search text after a pick in multi-select. */
  readonly keepSearchText = input(false);
  readonly pageSize = input(20);
  /** Delay before a search reaches the backend, ms. */
  readonly debounce = input(400);

  // ── Look ────────────────────────────────────────────────────────────
  /** Render only the visible options. Rows must be `itemSize` px high. */
  readonly virtualScroll = input(true);
  readonly itemSize = input(34);
  readonly panelMaxHeight = input(264);
  readonly inputClass = input('');
  readonly panelClass = input('');
  /** Status texts; translation keys work when the app provides UI_TRANSLATE. */
  readonly loadingText = input('Loading…');
  readonly searchText = input('Search');
  readonly noResultsText = input('No results');

  // ── Outputs ─────────────────────────────────────────────────────────
  private readonly search$ = new Subject<SelectSearchEvent>();
  readonly search = outputFromObservable(this.search$);
  readonly opened = output<void>();
  /** A user pick; carries the whole value (an array in multi-select). */
  readonly selected = output<any>();
  /** The clear button or a chip's ×; carries the value after clearing. */
  readonly cleared = output<any>();
  /** The clear button; carries the value before clearing. */
  readonly removed = output<any>();
  readonly valueChange = output<any>();

  // ── State ───────────────────────────────────────────────────────────
  protected readonly id = `ui-select-${nextId++}`;
  protected readonly open = signal(false);
  protected readonly text = signal('');
  protected readonly activeIndex = signal(-1);
  protected readonly value = signal<any>(null);
  private readonly formDisabled = signal(false);
  protected readonly isDisabled = computed(() => this.disabled() || this.formDisabled());

  /** Loaded options — `items` batches merged by value when `keepItems` is on. */
  private readonly options = linkedSignal<readonly any[], any[]>({
    source: this.items,
    computation: (items, previous) => {
      if (!untracked(this.keepItems) || !previous) {
        return [...(items ?? [])];
      }
      const seen = new Set(previous.value.map((item) => this.valueOf(item)));
      return [...previous.value, ...(items ?? []).filter((item) => !seen.has(this.valueOf(item)))];
    },
  });

  /** A request is in flight. Cleared when `loading` or `items` changes. */
  protected readonly pending = linkedSignal(() => {
    this.items();
    return this.loading();
  });

  protected readonly filtered = computed(() => {
    const query = this.text().trim().toLowerCase();
    const options = this.options();
    if (!query) {
      return options;
    }
    const match = this.filterFn();
    return options.filter((item) =>
      match ? match(query, item) : this.labelOf(item).toLowerCase().includes(query),
    );
  });

  protected readonly selectedValues = computed<any[]>(() => {
    const value = this.value();
    if (this.multiple()) {
      return Array.isArray(value) ? value : [];
    }
    return value === null || value === undefined || value === '' ? [] : [value];
  });

  private readonly labelCache = new Map<unknown, string>();

  protected readonly chips = computed(() => {
    const options = this.options();
    return this.selectedValues().map((value) => {
      const item = options.find((option) => this.valueOf(option) === value);
      return { value, label: item ? this.labelOf(item) : (this.labelCache.get(value) ?? `${value}`) };
    });
  });

  protected readonly hasValue = computed(() => this.selectedValues().length > 0);

  /** The virtual viewport needs a fixed height; it shrinks for short lists. */
  protected readonly listHeight = computed(() =>
    Math.min(this.filtered().length * this.itemSize(), this.panelMaxHeight()),
  );

  protected readonly positions: ConnectedPosition[] = [
    { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 2 },
    { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -2 },
  ];

  protected readonly origin = viewChild.required(CdkOverlayOrigin);
  private readonly input = viewChild.required<ElementRef<HTMLInputElement>>('field');
  private readonly viewport = viewChild(CdkVirtualScrollViewport);
  private readonly list = viewChild<ElementRef<HTMLElement>>('list');
  protected triggerWidth = 0;

  private searchTimer?: ReturnType<typeof setTimeout>;
  private page = { offset: 0, limit: 20 };
  private onChange: (value: any) => void = () => {};
  private onTouched: () => void = () => {};

  constructor() {
    effect(() => {
      const fallback = this.defaultValue();
      if (fallback !== null && fallback !== undefined) {
        untracked(() => this.commit(this.multiple() ? [fallback] : fallback, false));
      }
    });
    // A long list keeps the active row in view while arrowing through it.
    effect(() => {
      const index = this.activeIndex();
      if (index < 0 || !this.open()) {
        return;
      }
      const viewport = this.viewport();
      if (viewport) {
        const range = viewport.getRenderedRange();
        if (index <= range.start || index >= range.end - 1) {
          viewport.scrollToIndex(Math.max(0, index - 2));
        }
      } else {
        this.list()
          ?.nativeElement.querySelector(`[data-index="${index}"]`)
          ?.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  // ── Template helpers ────────────────────────────────────────────────

  protected valueOf(item: any): any {
    if (item === null || typeof item !== 'object') {
      return item;
    }
    const key = this.optionValue() || this.optionLabel();
    return key ? item[key] : item;
  }

  protected labelOf(item: any): string {
    if (item === null || typeof item !== 'object') {
      return this.display(item);
    }
    const label = this.optionLabel() ? item[this.optionLabel()] : undefined;
    return this.display(label ?? this.valueOf(item));
  }

  private display(raw: unknown): string {
    if (raw === null || raw === undefined) {
      return '';
    }
    const text = this.translate(`${raw}`);
    return typeof text === 'string' ? text : `${raw}`;
  }

  protected isOptionDisabled(item: any): boolean {
    const key = this.disabledKey();
    return !!key && !!item?.[key];
  }

  protected isSelected(item: any): boolean {
    return this.selectedValues().includes(this.valueOf(item));
  }

  // ── Open / close ────────────────────────────────────────────────────

  protected openPanel(): void {
    if (this.isDisabled() || this.open()) {
      return;
    }
    this.triggerWidth = this.origin().elementRef.nativeElement.getBoundingClientRect().width;
    this.open.set(true);
    this.opened.emit();
    const index = this.filtered().findIndex((item) => this.isSelected(item));
    this.activeIndex.set(index);
    if (index > 0) {
      queueMicrotask(() => this.viewport()?.scrollToIndex(Math.max(0, index - 2)));
    }
  }

  protected closePanel(): void {
    if (!this.open()) {
      return;
    }
    this.open.set(false);
    this.activeIndex.set(-1);
    if (!this.autoComplete() && !(this.multiple() && this.keepSearchText())) {
      this.text.set('');
    }
  }

  protected onBlur(): void {
    this.closePanel();
    this.onTouched();
  }

  /** Clicking a chip or the arrow focuses the field, which opens the panel. */
  protected focusField(event: MouseEvent): void {
    if (this.isDisabled()) {
      return;
    }
    event.preventDefault();
    const field = this.input().nativeElement;
    if (document.activeElement === field) {
      this.open() ? this.closePanel() : this.openPanel();
    } else {
      field.focus();
    }
  }

  // ── Typing and searching ────────────────────────────────────────────

  protected onInput(event: Event): void {
    const text = (event.target as HTMLInputElement).value;
    this.text.set(text);
    this.openPanel();
    this.activeIndex.set(this.firstEnabled(0, 1));
    if (this.autoComplete() && !this.multiple()) {
      this.commit(text, true);
    }

    clearTimeout(this.searchTimer);
    const lastCharacter = (event as InputEvent).data ?? '';
    this.searchTimer = setTimeout(() => {
      if (!this.searchBackEnd()) {
        return;
      }
      if (this.autoSearch() || (text && this.filtered().length === 0)) {
        this.page = { offset: 0, limit: this.pageSize() };
        this.emitSearch(lastCharacter);
      }
    }, this.debounce());
  }

  protected runForcedSearch(event: Event): void {
    event.preventDefault();
    this.page = { offset: 0, limit: this.pageSize() };
    this.emitSearch('');
  }

  /** Loads the next page when the list is scrolled near its end. */
  protected onListScroll(target: EventTarget | null): void {
    const element = target as HTMLElement;
    const nearEnd =
      element.scrollTop + element.clientHeight >= element.scrollHeight - this.itemSize() * 2;
    const total = this.total();
    const hasMore = total === null || this.options().length < total;
    if (nearEnd && hasMore && this.loadOnScroll() && this.searchBackEnd() && !this.pending()) {
      this.page = { offset: this.page.offset + 1, limit: this.pageSize() };
      this.emitSearch('');
    }
  }

  private emitSearch(lastCharacter: string): void {
    // Without a listener nothing would ever clear the spinner.
    if (!this.search$.observed) {
      return;
    }
    this.pending.set(true);
    this.search$.next({ lastCharacter, text: this.text(), page: { ...this.page } });
  }

  // ── Picking ─────────────────────────────────────────────────────────

  protected pick(item: any, event?: Event): void {
    event?.preventDefault(); // keeps focus in the field, so the panel stays usable
    if (this.isOptionDisabled(item)) {
      return;
    }
    const value = this.valueOf(item);
    this.labelCache.set(value, this.labelOf(item));

    if (this.multiple()) {
      const current = this.selectedValues();
      this.commit(
        current.includes(value) ? current.filter((v) => v !== value) : [...current, value],
        true,
      );
      if (!this.keepSearchText()) {
        this.text.set('');
      }
    } else {
      this.commit(value, true);
      this.text.set('');
      this.closePanel();
    }
    this.selected.emit(this.value());
  }

  protected removeChip(value: any, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    if (this.isDisabled()) {
      return;
    }
    this.commit(
      this.selectedValues().filter((v) => v !== value),
      true,
    );
    this.cleared.emit(this.value());
  }

  protected clear(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    if (this.isDisabled()) {
      return;
    }
    this.removed.emit(this.value());
    const fallback = this.defaultValue();
    this.commit(this.multiple() ? (fallback === null ? [] : [fallback]) : fallback, true);
    this.text.set('');
    this.cleared.emit(this.value());
  }

  private commit(value: any, notify: boolean): void {
    this.value.set(value);
    if (notify) {
      this.onChange(value);
      this.valueChange.emit(value);
    }
  }

  // ── Keyboard ────────────────────────────────────────────────────────

  protected onKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault();
        if (!this.open()) {
          this.openPanel();
          return;
        }
        const step = event.key === 'ArrowDown' ? 1 : -1;
        const count = this.filtered().length;
        const from = this.activeIndex() < 0 ? (step > 0 ? 0 : count - 1) : this.activeIndex() + step;
        const next = this.firstEnabled(from, step);
        if (next !== -1) {
          this.activeIndex.set(next);
        }
        return;
      }
      case 'Enter': {
        if (!this.open()) {
          return;
        }
        event.preventDefault();
        const item = this.filtered()[this.activeIndex()];
        if (item !== undefined) {
          this.pick(item);
        } else if (this.multiple() && this.autoComplete() && this.text().trim()) {
          this.commit([...this.selectedValues(), this.text().trim()], true);
          this.text.set('');
          this.selected.emit(this.value());
        }
        return;
      }
      case 'Escape':
        if (this.open()) {
          event.preventDefault();
          event.stopPropagation(); // close the list, not the modal around it
          this.closePanel();
        }
        return;
      case 'Backspace':
        if (this.multiple() && !this.text() && this.hasValue() && this.allowClear()) {
          this.commit(this.selectedValues().slice(0, -1), true);
          this.cleared.emit(this.value());
        }
        return;
    }
  }

  /** First selectable index from `from`, walking by `step`; -1 if none. */
  private firstEnabled(from: number, step: 1 | -1): number {
    const items = this.filtered();
    for (let i = from; i >= 0 && i < items.length; i += step) {
      if (!this.isOptionDisabled(items[i])) {
        return i;
      }
    }
    return -1;
  }

  // ── ControlValueAccessor ────────────────────────────────────────────

  writeValue(value: any): void {
    if (this.multiple()) {
      this.value.set(Array.isArray(value) ? value : value === null || value === undefined ? [] : [value]);
    } else {
      this.value.set(value ?? null);
    }
    if (this.autoComplete() && !this.multiple()) {
      this.text.set(value ?? '');
    }
  }

  registerOnChange(fn: (value: any) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.formDisabled.set(isDisabled);
  }
}
