import { DecimalPipe, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  PLATFORM_ID,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Observable, Subject } from 'rxjs';
import { UiSafeHtmlPipe } from '../../core/safe-html';
import { UiTranslatePipe } from '../../core/translate';
import { Select } from '../select/select';
import { TableMenu, TableMenuState } from './table-menu';
import {
  ModifyTableDeclaration,
  PageEtolv,
  ROW_ACTIONS_FIELD,
  SortDefault,
  SortType,
  TableCell,
  TableColumn,
  TableData,
  TableLoadEvent,
  TablePageSizes,
  TableRow,
  TableSelectEvent,
  action_type,
  contextMenuItem,
  contextSelectorFunc,
  returnCellRender,
  rows,
} from './table.types';

const ORDER_STORAGE_KEY = 'order-header-table';
/** Extra rows rendered above and below the viewport when virtualising. */
const VIRTUAL_BUFFER = 6;

/**
 * Infinite-scroll data table, ported from the portal's `etolv-table`.
 *
 * The parent owns the data: the table emits `more` with the page and sort it
 * needs, and the parent pushes each result into `rows`. Column definitions use
 * the portal's shapes (see table.types.ts).
 *
 * Pass `rowHeight` to render only the rows in view — for tables of thousands
 * of rows. Every row must then be exactly that tall.
 */
@Component({
  selector: 'ui-table',
  imports: [DecimalPipe, FormsModule, Select, TableMenu, UiSafeHtmlPipe, UiTranslatePipe],
  templateUrl: './table.html',
  styleUrl: './table.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Table implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  // ── Inputs ──────────────────────────────────────────────────────────
  readonly headers = input.required<TableColumn[]>();
  /** Each emission is one page of data; `null` is ignored. */
  readonly rows = input.required<Observable<rows | null>>();
  /** `next()` reloads from page 0; `next(false)` only clears. */
  readonly reset = input<Subject<void | boolean>>(new Subject<void | boolean>());
  /** Edit, delete or add one row without reloading. */
  readonly modify = input<Observable<ModifyTableDeclaration> | null>(null);
  readonly page = input<PageEtolv>({ limit: 20, page: 0, count: 0 });
  /** Initial sort. Without one, headers are not sortable. */
  readonly defaultSort = input<SortDefault | null>(null);
  readonly pageSizes = input<TablePageSizes | null>(null);
  readonly contextMenu = input<contextMenuItem | null>(null);
  /** Builds the menu per row; wins over `contextMenu`. */
  readonly contextSelector = input<contextSelectorFunc | null>(null);
  /** Adds a sticky ⋮ column when a context menu is set. */
  readonly showRowActions = input(true);
  readonly showFooter = input(false);
  readonly footerVariant = input<'normal' | 'footer-data-shadow'>('normal');
  /** Header rows, for grouped headers (`spainRow` / `colspan`). */
  readonly headerRows = input(1);
  /** Extra footer figures: label → value. */
  readonly summary = input<Record<string, unknown> | null>(null);
  readonly minHeight = input('200px');
  readonly maxHeight = input('500px');
  /** Fixed row height in px; turns on row virtualisation. */
  readonly rowHeight = input<number | null>(null);
  /** Record key used as the row's DOM id (`Row-<id>`). */
  readonly rowId = input<string | null>(null);
  /** Saves the user's column order under this key in localStorage. */
  readonly storageKey = input<string | null>(null);
  readonly tableId = input('ui-table');
  readonly loadingText = input('Loading…');
  readonly noDataText = input('No data found');
  readonly resultLabel = input('Results');

  // ── Outputs ─────────────────────────────────────────────────────────
  /** Load the given page; push the result into `rows`. */
  readonly more = output<TableLoadEvent>();
  readonly rowSelect = output<TableSelectEvent>();

  // ── State ───────────────────────────────────────────────────────────
  protected readonly loading = signal(false);
  protected readonly lastRow = signal(false);
  protected readonly noData = signal(false);
  protected readonly tableRows = signal<TableRow[]>([]);
  protected readonly menu = signal<TableMenuState | null>(null);
  protected readonly pageState = linkedSignal(() => ({ ...this.page() }));
  protected readonly sort = linkedSignal(() => this.defaultSort());
  protected readonly pageSize = linkedSignal(() => this.pageSizes()?.default_value ?? null);

  private data: TableData[] = [];
  /** Original column index for each displayed position. */
  private order: number[] = [];
  private dragFrom = -1;
  /** Last checked row per column — the shift-click anchor. */
  private anchors = new Map<number, number>();

  protected readonly hasMenu = computed(
    () => this.showRowActions() && (!!this.contextSelector() || !!this.contextMenu()),
  );

  /** Headers with the saved order applied and the row-menu column appended. */
  protected readonly columns = linkedSignal<TableColumn[]>(() => {
    const headers = this.headers().filter((h) => h.field !== ROW_ACTIONS_FIELD);
    this.order = this.savedOrder(headers.length);
    const ordered = this.order.map((i) => headers[i]);
    return this.hasMenu()
      ? [...ordered, { field: ROW_ACTIONS_FIELD, headerName: '', Headstyle: '' }]
      : ordered;
  });

  protected readonly headerRowList = computed(() =>
    Array.from({ length: Math.max(1, this.headerRows()) }, (_, i) => i),
  );

  // ── Virtualisation ──────────────────────────────────────────────────
  private readonly container = viewChild.required<ElementRef<HTMLElement>>('container');
  private readonly sentinel = viewChild.required<ElementRef<HTMLElement>>('sentinel');
  private readonly scrollTop = signal(0);
  private readonly viewportHeight = signal(500);

  protected readonly view = computed(() => {
    const rows = this.tableRows();
    const height = this.rowHeight();
    if (!height) {
      return { rows, start: 0, top: 0, bottom: 0 };
    }
    const start = Math.max(0, Math.floor(this.scrollTop() / height) - VIRTUAL_BUFFER);
    const count = Math.ceil(this.viewportHeight() / height) + VIRTUAL_BUFFER * 2;
    const visible = rows.slice(start, start + count);
    return {
      rows: visible,
      start,
      top: start * height,
      bottom: Math.max(0, (rows.length - start - visible.length) * height),
    };
  });

  constructor() {
    // Columns changed while rows are shown: rebuild the cells from the kept data,
    // so header and body always describe the same columns.
    effect(() => {
      this.columns();
      untracked(() => this.rebuildRows());
    });

    afterNextRender(() => {
      const container = this.container().nativeElement;
      this.viewportHeight.set(container.clientHeight);
      if (typeof IntersectionObserver === 'undefined') {
        return;
      }
      // The sentinel sits under the last row; seeing it means "load the next page".
      // Also covers a first page too short to fill the container.
      const observer = new IntersectionObserver(
        (entries) => entries.some((e) => e.isIntersecting) && this.maybeLoadMore(),
        { root: container, rootMargin: '0px 0px 320px 0px' },
      );
      observer.observe(this.sentinel().nativeElement);
      this.destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  ngOnInit(): void {
    this.rows()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => this.receive(result));
    this.reset()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((reload = true) => {
        this.clear();
        if (reload !== false) {
          this.requestPage(true);
        }
      });
    this.modify()
      ?.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((change) => this.applyModification(change));
    this.requestPage(true);
  }

  // ── Loading ─────────────────────────────────────────────────────────

  private requestPage(first = false): void {
    this.loading.set(true);
    const page = this.pageState();
    const next = { ...page, page: first ? page.page : page.page + 1 };
    this.pageState.set(next);
    this.more.emit({ page: { ...next }, sort: this.sort() ? { ...this.sort()! } : null });
  }

  private maybeLoadMore(): void {
    if (!this.loading() && !this.lastRow() && !this.noData() && this.data.length < this.pageState().count) {
      this.requestPage();
    }
  }

  private receive(result: rows | null): void {
    if (!result) {
      return;
    }
    this.loading.set(false);
    if (!result.block) {
      this.noData.set(this.data.length === 0);
      this.lastRow.set(true);
      return;
    }
    this.noData.set(false);
    this.pageState.update((page) => ({ ...page, count: result.total }));
    this.append(result.block);
    if (this.data.length >= result.total) {
      this.lastRow.set(true);
    } else {
      this.rearmObserver();
    }
  }

  /** IntersectionObserver only fires on change; re-observe to re-check a still-visible sentinel. */
  private rearmObserver(): void {
    if (!this.isBrowser) {
      return;
    }
    // Let the new rows render first.
    requestAnimationFrame(() => {
      const sentinel = this.sentinel().nativeElement;
      const container = this.container().nativeElement;
      const gap = sentinel.getBoundingClientRect().top - container.getBoundingClientRect().bottom;
      if (gap < 320) {
        this.maybeLoadMore();
      }
    });
  }

  private clear(): void {
    this.data = [];
    this.anchors.clear();
    this.tableRows.set([]);
    this.lastRow.set(false);
    this.noData.set(false);
    this.scrollTop.set(0);
    this.pageState.update((page) => ({ limit: page.limit, page: 0, count: 0 }));
    if (this.isBrowser) {
      this.container().nativeElement.scrollTop = 0;
    }
  }

  protected reload(): void {
    if (!this.loading()) {
      this.reset().next();
    }
  }

  protected changePageSize(value: string): void {
    const size = Number(value);
    this.pageSize.set(size);
    // 0 = "All": ask for everything the backend reported.
    const limit = size === 0 ? this.pageState().count || 0 : size;
    this.pageState.update((page) => ({ ...page, limit }));
    this.reset().next();
  }

  protected onScroll(event: Event): void {
    if (this.rowHeight()) {
      const target = event.target as HTMLElement;
      this.scrollTop.set(target.scrollTop);
      this.viewportHeight.set(target.clientHeight);
    }
  }

  // ── Building rows ───────────────────────────────────────────────────

  private append(records: TableData[]): void {
    const idKey = this.rowId();
    const fresh: TableRow[] = [];
    for (const record of records) {
      if (idKey && (record[idKey] === undefined || record[idKey] === null)) {
        console.warn(`ui-table: row skipped, missing "${idKey}"`, record);
        continue;
      }
      fresh.push(this.buildRow(record, this.data.length));
      this.data.push(record);
    }
    this.tableRows.update((rows) => [...rows, ...fresh]);
  }

  private rebuildRows(): void {
    if (!this.data.length) {
      return;
    }
    this.anchors.clear();
    this.tableRows.set(this.data.map((record, i) => this.buildRow(record, i)));
  }

  private buildRow(record: TableData, index: number): TableRow {
    const row: TableRow = { cells: [], id: this.rowId() ? record[this.rowId()!] : undefined };
    for (const column of this.columns()) {
      if (column.field === ROW_ACTIONS_FIELD) {
        row.cells.push({ isActions: true, Checked: false });
        continue;
      }
      const value = this.readField(record, column.field, column.default ?? '-');
      const rendered: returnCellRender = column.cellRendererFull
        ? column.cellRendererFull(record, index)
        : column.cellRenderer
          ? column.cellRenderer(value, index)
          : value;
      if (rendered !== null && typeof rendered === 'object') {
        const { RowClass, RowStyle, RowClick, ...cell } = rendered;
        row.cells.push({ ...cell, Checked: false });
        row.RowClass = RowClass ?? row.RowClass;
        row.RowStyle = RowStyle ?? row.RowStyle;
        row.RowClick = RowClick ?? row.RowClick;
      } else {
        row.cells.push({ value: rendered === undefined || rendered === null ? '' : `${rendered}`, Checked: false });
      }
    }
    return row;
  }

  /** `a.b.c` walks nested objects; `a||b` takes the first present field. */
  private readField(record: TableData, field: string, fallback: string): any {
    for (const path of field.split('||')) {
      const value = path.split('.').reduce<any>((obj, key) => obj?.[key], record);
      if (value !== undefined && value !== null) {
        return value;
      }
    }
    return fallback;
  }

  private applyModification(change: ModifyTableDeclaration): void {
    const { index } = change;
    switch (change.action_type) {
      case action_type.edit: {
        if (!this.data[index]) {
          return;
        }
        this.data[index] = { ...this.data[index], ...change.new_data };
        const rebuilt = this.buildRow(this.data[index], index);
        this.tableRows.update((rows) => rows.map((row, i) => (i === index ? rebuilt : row)));
        break;
      }
      case action_type.delete:
        if (!this.data[index]) {
          return;
        }
        this.data.splice(index, 1);
        this.anchors.clear();
        this.tableRows.update((rows) => rows.filter((_, i) => i !== index));
        this.pageState.update((page) => ({ ...page, count: Math.max(0, page.count - 1) }));
        break;
      case action_type.add: {
        const at = index < 0 || index > this.data.length ? this.data.length : index;
        this.data.splice(at, 0, change.new_data);
        this.noData.set(false);
        this.anchors.clear();
        this.tableRows.update((rows) => {
          const next = [...rows];
          next.splice(at, 0, this.buildRow(change.new_data, at));
          return next;
        });
        this.pageState.update((page) => ({ ...page, count: page.count + 1 }));
        break;
      }
    }
  }

  // ── Header ──────────────────────────────────────────────────────────

  private spanRows(column: TableColumn): number {
    return column.spainRow ? column.spainRow.length : this.headerRows();
  }

  /** Whether `column` starts a cell in header row `row` (grouped headers). */
  protected showHeaderCell(column: TableColumn, row: number): boolean {
    return column.colspan?.[row] ? this.spanRows(column) === row + 1 : row + 1 > this.spanRows(column) || row === 0;
  }

  protected headerRowspan(column: TableColumn): number {
    return column.colspan ? 1 : this.spanRows(column);
  }

  /** A group cell (a `spainRow` entry) rather than the column's own header. */
  protected isGroupCell(column: TableColumn, row: number): boolean {
    return !!column.spainRow?.[row];
  }

  protected isSortedBy(column: TableColumn, row: number): boolean {
    return !this.isGroupCell(column, row) && this.sort()?.field === column.field;
  }

  protected sortBy(column: TableColumn, row: number): void {
    const sort = this.sort();
    if (!sort || this.loading() || this.isGroupCell(column, row) || column.field === ROW_ACTIONS_FIELD) {
      return;
    }
    this.sort.set(
      sort.field === column.field
        ? { field: column.field, type: sort.type === SortType.asc ? SortType.desc : SortType.asc }
        : { field: column.field, type: SortType.asc },
    );
    this.reset().next(true);
  }

  // ── Column drag & drop ──────────────────────────────────────────────

  /** Grouped columns and the row-menu column stay in place. */
  protected canDrag(column: TableColumn | undefined): boolean {
    return !!column && column.field !== ROW_ACTIONS_FIELD && !column.spainRow && !column.colspan;
  }

  protected onDragStart(index: number): void {
    this.dragFrom = index;
  }

  protected onDrop(event: DragEvent, to: number): void {
    event.preventDefault();
    const from = this.dragFrom;
    this.dragFrom = -1;
    const columns = this.columns();
    if (from < 0 || from === to || !this.canDrag(columns[from]) || !this.canDrag(columns[to])) {
      return;
    }
    const next = [...columns];
    [next[from], next[to]] = [next[to], next[from]];
    [this.order[from], this.order[to]] = [this.order[to], this.order[from]];
    this.saveOrder();
    this.columns.set(next);
  }

  /**
   * The saved order is a list of positions, so it only fits the exact column set
   * it was saved for. Anything that is not a full permutation is dropped.
   */
  private savedOrder(length: number): number[] {
    const identity = Array.from({ length }, (_, i) => i);
    const key = this.storageKey();
    if (!key || !this.isBrowser) {
      return identity;
    }
    const store = this.readStore();
    const saved = store[key];
    const usable =
      Array.isArray(saved) &&
      saved.length === length &&
      [...saved].sort((a, b) => a - b).every((v, i) => v === i);
    if (usable) {
      return [...saved];
    }
    if (saved) {
      delete store[key];
      localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(store));
    }
    return identity;
  }

  private saveOrder(): void {
    const key = this.storageKey();
    if (!key || !this.isBrowser) {
      return;
    }
    const store = this.readStore();
    if (this.order.every((v, i) => v === i)) {
      delete store[key];
    } else {
      store[key] = [...this.order];
    }
    localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(store));
  }

  private readStore(): Record<string, number[]> {
    try {
      return JSON.parse(localStorage.getItem(ORDER_STORAGE_KEY) ?? '{}') ?? {};
    } catch {
      return {};
    }
  }

  // ── Selection ───────────────────────────────────────────────────────

  protected isRowSelected(row: TableRow): boolean {
    return row.cells.some((cell) => cell.Checked);
  }

  protected columnState(col: number): 'none' | 'some' | 'all' {
    const rows = this.tableRows();
    const checked = rows.filter((row) => row.cells[col]?.Checked).length;
    return checked === 0 ? 'none' : checked === rows.length ? 'all' : 'some';
  }

  protected onCheck(event: MouseEvent, rowIndex: number, col: number): void {
    event.stopPropagation(); // don't fire RowClick
    const box = event.target as HTMLInputElement;
    const rows = this.tableRows();
    const cell = rows[rowIndex].cells[col];

    if (typeof cell.CheckBox === 'function') {
      cell.Checked = box.checked;
      cell.CheckBox(event, rowIndex, rows, this.data);
      this.tableRows.set([...rows]);
      return;
    }

    if (!box.checked) {
      this.setChecked(rowIndex, col, false, box);
      this.anchors.delete(col);
    } else {
      const additive = event.ctrlKey || event.metaKey;
      const anchor = this.anchors.get(col);
      if (cell.shiftSelect && event.shiftKey && anchor !== undefined) {
        const [from, to] = anchor < rowIndex ? [anchor, rowIndex] : [rowIndex, anchor];
        for (let i = from; i <= to; i++) {
          this.setChecked(i, col, true, i === rowIndex ? box : null);
        }
      } else {
        const keepOthers = cell.multiSelect || (cell.ctrlSelect && additive);
        if (!keepOthers) {
          rows.forEach((_, i) => i !== rowIndex && this.setChecked(i, col, false, null));
        }
        this.setChecked(rowIndex, col, true, box);
      }
      this.anchors.set(col, rowIndex);
    }
    this.tableRows.set([...rows]);
  }

  protected toggleColumn(event: Event, col: number): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.tableRows().forEach((_, i) => this.setChecked(i, col, checked, null));
    this.anchors.delete(col);
    this.tableRows.set([...this.tableRows()]);
  }

  private setChecked(rowIndex: number, col: number, checked: boolean, element: HTMLInputElement | null): void {
    const cell = this.tableRows()[rowIndex]?.cells[col];
    if (!cell || cell.Checked === checked) {
      return;
    }
    cell.Checked = checked;
    this.rowSelect.emit({
      row: this.data[rowIndex],
      checked,
      key: this.columns()[col].field,
      html_element: element,
    });
  }

  // ── Cell handlers ───────────────────────────────────────────────────

  protected onRowClick(event: Event, row: TableRow, index: number): void {
    row.RowClick?.(event, index, this.tableRows(), this.data);
  }

  protected onCellClick(event: Event, cell: TableCell, index: number): void {
    cell.ActionClick?.(event, index, this.tableRows(), this.data);
  }

  protected callCellInput(handler: unknown, event: any, index: number): void {
    if (typeof handler === 'function') {
      handler(event, index, this.tableRows(), this.data);
    }
  }

  // ── Context menu ────────────────────────────────────────────────────

  private longPress?: ReturnType<typeof setTimeout>;

  protected openMenu(event: MouseEvent, index: number): void {
    if (!this.hasMenu()) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.showMenu(index, event.clientX, event.clientY);
  }

  protected openMenuFromButton(event: MouseEvent, index: number): void {
    event.stopPropagation();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.showMenu(index, rect.left + rect.width / 2, rect.bottom + 4);
  }

  protected onTouchStart(event: TouchEvent, index: number): void {
    const touch = event.touches[0];
    this.longPress = setTimeout(() => this.showMenu(index, touch.clientX, touch.clientY), 500);
  }

  protected onTouchEnd(): void {
    clearTimeout(this.longPress);
  }

  private showMenu(index: number, x: number, y: number): void {
    const row = this.data[index];
    const selector = this.contextSelector();
    const menu = selector ? selector(row, index) : this.contextMenu();
    if (menu) {
      this.menu.set({ menu, row, index, x, y });
    }
  }

  protected summaryEntries(): { key: string; value: unknown; isNumber: boolean }[] {
    return Object.entries(this.summary() ?? {}).map(([key, value]) => ({
      key,
      value,
      isNumber: typeof value === 'number',
    }));
  }
}
