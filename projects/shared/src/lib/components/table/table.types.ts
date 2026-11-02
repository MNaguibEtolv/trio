import { WritableSignal } from '@angular/core';

/**
 * Column and cell configuration for `ui-table`.
 *
 * These shapes match the portal's `etolv-table` (HeaderEtolv, returnCellRender,
 * contextMenuItem…), so column definitions written for the portal work here
 * unchanged. Only the component's inputs and outputs were renamed.
 */

/** One raw record as it came from the API. */
export type TableData = Record<string, any>;

/** Callback signature shared by every cell / row handler. */
export type TableRowHandler = (
  event: any,
  rowIndex: number,
  rows: TableRow[],
  data: TableData[],
) => void;

export type TableCellInput =
  | {
      type: 'number' | 'text' | 'date' | 'time' | 'checkbox' | 'radio';
      placeholder?: string;
      disabled?: boolean;
      value: WritableSignal<any>;
      onChange?: TableRowHandler;
      onInput?: TableRowHandler;
    }
  | {
      type: 'select';
      placeholder?: string;
      Items: WritableSignal<Array<any>>;
      optionTextField: string;
      optionValueField: string;
      allowClear?: boolean;
      disabled?: boolean;
      value: WritableSignal<any>;
      loading?: WritableSignal<boolean>;
      count?: WritableSignal<number>;
      scroll_event?: boolean;
      force_search?: boolean;
      onSelect?: TableRowHandler;
      onClear?: TableRowHandler;
      onTyped?: TableRowHandler;
    };

/** What a `cellRenderer` returns: an HTML string, or an object for full control. */
export type returnCellRender =
  | string
  | {
      /** Cell HTML. Built by the app — never raw user input. */
      value: string;
      cssClasseCel?: string;
      cssStyle?: string;
      cssStyleColumn?: string;
      ClassColumn?: string;
      /** `true` for the built-in selection, or a handler for custom logic. */
      CheckBox?: boolean | TableRowHandler;
      CheckBoxStyle?: string;
      CheckBoxClass?: string;
      /** Several rows may be checked in this column. */
      multiSelect?: boolean;
      /** Shift-click checks the range from the last checked row. */
      shiftSelect?: boolean;
      /** Ctrl/⌘-click adds to the selection. */
      ctrlSelect?: boolean;
      ActionClick?: TableRowHandler;
      RowStyle?: string;
      RowClass?: string;
      RowClick?: TableRowHandler;
      td_input?: TableCellInput;
    };

export interface TableColumn {
  /** Path into the record; `a.b` for nested, `a||b` for the first non-empty. */
  field: string;
  headerName: string;
  /** Receives the field's value. */
  cellRenderer?: (value: any, rowIndex: number) => returnCellRender;
  /** Receives the whole record; wins over `cellRenderer`. */
  cellRendererFull?: (row: any, rowIndex: number) => returnCellRender;
  /** Shown when the field is empty. Default `-`. */
  default?: string;
  /** Adds a select-all checkbox to the header. */
  HeaderCheck?: boolean;
  /** Inline CSS for the header cell. */
  Headstyle?: string;
  /** Hint shown under the header title. */
  SearchBy?: string;
  /** Text for the footer row (`showFooter`). */
  footer?: string;
  /** Grouped header: one entry per header row. */
  spainRow?: { Data?: string; html?: string; colspan: number; style?: string }[];
  /** Per header row: whether this column sits under a group there. */
  colspan?: boolean[];
}

/** The portal's name for a column list. */
export type HeaderEtolv = TableColumn[];

export interface contextMenu {
  ClassCSS?: string;
  SytleCSS?: string;
  /** Raw HTML icon. */
  DiffIcon?: string;
  IconStyle?: string;
  /** Icon class(es) for an `<i>`. */
  Icon?: string;
  ClassIcon?: string;
  /** Children are shown flattened into the same menu. */
  SubMenu?: Record<string, contextMenu | ContextMenuAction>;
  Action?: ContextMenuAction;
  StyleDiv?: string;
}

export type ContextMenuAction = (row: any, rowIndex: number) => void;

/** Label (or translation key) → item. */
export type contextMenuItem = Record<string, contextMenu | ContextMenuAction | string>;

export type contextSelectorFunc = (row: TableData, rowIndex: number) => contextMenuItem;

export enum SortType {
  desc = 'desc',
  asc = 'asc',
}
/** The portal's name for SortType. */
export { SortType as type };

export interface SortDefault {
  field: string;
  type: SortType;
}

export interface PageEtolv {
  limit: number;
  page: number;
  count: number;
}

/** One page of data pushed into the table. `block: null` means no data. */
export interface rows {
  block: TableData[] | null;
  total: number;
}

export enum action_type {
  add = 'add',
  edit = 'edit',
  delete = 'delete',
}

export interface ModifyTableDeclaration {
  action_type: action_type;
  /** Row to change. For `add`, a negative index appends. */
  index: number;
  old_date?: any;
  new_data?: any;
}

export interface TablePageSizes {
  /** `value: 0` means "all rows". */
  items: { title: string; value: number }[];
  default_value: number;
}

export interface TableSelectEvent {
  row: TableData;
  checked: boolean;
  /** Field of the checkbox column. */
  key: string;
  html_element: HTMLInputElement | null;
}

export interface TableLoadEvent {
  page: PageEtolv;
  sort: SortDefault | null;
}

// ── Rendered model ──────────────────────────────────────────────────────

export interface TableCell {
  value?: string;
  cssClasseCel?: string;
  cssStyle?: string;
  cssStyleColumn?: string;
  ClassColumn?: string;
  CheckBox?: boolean | TableRowHandler;
  CheckBoxStyle?: string;
  CheckBoxClass?: string;
  multiSelect?: boolean;
  shiftSelect?: boolean;
  ctrlSelect?: boolean;
  ActionClick?: TableRowHandler;
  td_input?: TableCellInput;
  Checked: boolean;
  /** The built-in row-menu cell. */
  isActions?: boolean;
}

export interface TableRow {
  cells: TableCell[];
  id?: unknown;
  RowClass?: string;
  RowStyle?: string;
  RowClick?: TableRowHandler;
}

/** Field of the row-menu column the table appends when a context menu is set. */
export const ROW_ACTIONS_FIELD = '__portalRowActions';
