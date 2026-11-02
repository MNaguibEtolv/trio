import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BehaviorSubject, Subject } from 'rxjs';
import { contextMenuItem } from '../context-menu/context-menu.types';
import { Table } from './table';
import {
  ModifyTableDeclaration,
  SortDefault,
  SortType,
  TableColumn,
  TableLoadEvent,
  TableSelectEvent,
  action_type,
  rows,
} from './table.types';

const PEOPLE = Array.from({ length: 1000 }, (_, i) => ({
  id: i + 1,
  name: `Person ${i + 1}`,
  city: { name: i % 2 ? 'Cairo' : 'Giza' },
}));

@Component({
  imports: [Table],
  template: `
    <ui-table
      [headers]="headers()"
      [rows]="rows$"
      [reset]="reset$"
      [modify]="modify$"
      [defaultSort]="sort"
      [contextMenu]="menu()"
      [rowHeight]="rowHeight()"
      rowId="id"
      (more)="loads.push($event)"
      (rowSelect)="selections.push($event)"
    />
  `,
})
class Host {
  headers = signal<TableColumn[]>([
    { field: 'id', headerName: 'ID' },
    { field: 'name', headerName: 'Name', cellRenderer: (v) => `<b>${v}</b>` },
    { field: 'city.name', headerName: 'City' },
    { field: 'missing', headerName: 'Missing' },
  ]);
  rows$ = new BehaviorSubject<rows | null>(null);
  reset$ = new Subject<void | boolean>();
  modify$ = new Subject<ModifyTableDeclaration>();
  sort: SortDefault = { field: 'id', type: SortType.desc };
  menu = signal<contextMenuItem | null>(null);
  rowHeight = signal<number | null>(null);
  loads: TableLoadEvent[] = [];
  selections: TableSelectEvent[] = [];
}

describe('Table', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;

  const el = () => fixture.nativeElement as HTMLElement;
  const bodyRows = () => Array.from(el().querySelectorAll<HTMLTableRowElement>('tbody tr.ui-table__row'));
  const cellText = (row: number, col: number) => bodyRows()[row].cells[col].textContent?.trim();
  const push = async (count: number, total = count) => {
    host.rows$.next({ block: PEOPLE.slice(0, count), total });
    await fixture.whenStable();
  };

  beforeEach(async () => {
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('asks for the first page, then renders the rows pushed back', async () => {
    expect(host.loads).toEqual([
      { page: { limit: 20, page: 0, count: 0 }, sort: { field: 'id', type: SortType.desc } },
    ]);

    await push(3);

    expect(bodyRows().length).toBe(3);
    expect(bodyRows()[0].id).toBe('Row-1');
    expect(bodyRows()[0].cells[1].innerHTML).toContain('<b>Person 1</b>');
    expect(cellText(1, 2)).toBe('Cairo'); // nested field
    expect(cellText(0, 3)).toBe('-'); // default for an empty field
    expect(el().querySelector('.ui-table__meta')?.textContent).toContain('3');
  });

  it('shows the no-data text when the page is empty', async () => {
    host.rows$.next({ block: null, total: 0 });
    await fixture.whenStable();

    expect(el().querySelector('.ui-table__status')?.textContent).toContain('No data found');
  });

  it('re-sorts from page 0 when a header is clicked', async () => {
    await push(3);
    el().querySelectorAll<HTMLElement>('.ui-table__th-label')[1].click();
    await fixture.whenStable();

    expect(host.loads.at(-1)).toEqual({
      page: { limit: 20, page: 0, count: 0 },
      sort: { field: 'name', type: SortType.asc },
    });
    expect(bodyRows().length).toBe(0); // cleared until the new page arrives
  });

  it('keeps one checked row per column unless multiSelect is set', async () => {
    host.headers.set([
      { field: 'id', headerName: 'Pick', HeaderCheck: true, cellRenderer: (v) => ({ value: `${v}`, CheckBox: true }) },
    ]);
    await push(3);
    const boxes = () => el().querySelectorAll<HTMLInputElement>('tbody input[type=checkbox]');

    boxes()[0].click();
    await fixture.whenStable();
    boxes()[1].click();
    await fixture.whenStable();

    expect([...boxes()].map((b) => b.checked)).toEqual([false, true, false]);
    expect(host.selections.map((s) => [s.row['id'], s.checked])).toEqual([
      [1, true],
      [1, false],
      [2, true],
    ]);
    expect(bodyRows()[1].classList).toContain('ui-table__row--selected');

    // Header box: indeterminate now, then selects every row.
    const all = el().querySelector<HTMLInputElement>('thead input[type=checkbox]')!;
    expect(all.indeterminate).toBe(true);
    all.click();
    await fixture.whenStable();
    expect([...boxes()].every((b) => b.checked)).toBe(true);
    expect(all.checked).toBe(true);
  });

  it('checks a range with shift-click when shiftSelect is on', async () => {
    host.headers.set([
      { field: 'id', headerName: 'Pick', cellRenderer: (v) => ({ value: `${v}`, CheckBox: true, shiftSelect: true }) },
    ]);
    await push(5);
    const boxes = () => el().querySelectorAll<HTMLInputElement>('tbody input[type=checkbox]');

    boxes()[1].click();
    await fixture.whenStable();
    boxes()[3].dispatchEvent(new MouseEvent('click', { shiftKey: true, bubbles: true }));
    await fixture.whenStable();

    expect([...boxes()].map((b) => b.checked)).toEqual([false, true, true, true, false]);
  });

  it('edits, deletes and adds single rows', async () => {
    await push(3);

    host.modify$.next({ action_type: action_type.edit, index: 0, new_data: { name: 'Edited' } });
    await fixture.whenStable();
    expect(bodyRows()[0].cells[1].textContent).toBe('Edited');

    host.modify$.next({ action_type: action_type.delete, index: 1 });
    await fixture.whenStable();
    expect(bodyRows().map((r) => r.id)).toEqual(['Row-1', 'Row-3']);

    host.modify$.next({ action_type: action_type.add, index: -1, new_data: { id: 50, name: 'New' } });
    await fixture.whenStable();
    expect(bodyRows().map((r) => r.id)).toEqual(['Row-1', 'Row-3', 'Row-50']);
  });

  it('opens the row menu from the ⋮ column and runs the action on that row', async () => {
    const action = vi.fn();
    host.menu.set({ Edit: { Action: action }, Delete: () => {} });
    await push(2);

    expect(el().querySelectorAll('th.ui-table__cell--actions').length).toBe(1);
    bodyRows()[1].querySelector<HTMLButtonElement>('.ui-table__menu-btn')!.click();
    await fixture.whenStable();

    const items = el().querySelectorAll<HTMLButtonElement>('.ui-context-menu__item');
    expect([...items].map((i) => i.textContent?.trim())).toEqual(['Edit', 'Delete']);
    items[0].click();
    await fixture.whenStable();

    expect(action).toHaveBeenCalledWith(PEOPLE[1], 1);
    expect(el().querySelector('.ui-context-menu')).toBeNull();
  });

  it('renders a select cell showing its current value', async () => {
    host.headers.set([
      {
        field: 'id',
        headerName: 'City',
        cellRenderer: () => ({
          value: '',
          td_input: {
            type: 'select',
            Items: signal([
              { id: 1, name: 'Cairo' },
              { id: 2, name: 'Giza' },
            ]),
            optionTextField: 'name',
            optionValueField: 'id',
            value: signal(2),
          },
        }),
      },
    ]);
    await push(1);
    await fixture.whenStable();

    expect(el().querySelector('ui-select .ui-select__value')?.textContent?.trim()).toBe('Giza');
  });

  it('renders only the rows in view when rowHeight is set', async () => {
    host.rowHeight.set(26);
    await fixture.whenStable();
    await push(1000);

    expect(bodyRows().length).toBeGreaterThan(0);
    expect(bodyRows().length).toBeLessThan(50);
    const spacer = el().querySelector<HTMLTableCellElement>('tr.ui-table__spacer td');
    expect(spacer?.style.height).toBe(`${(1000 - bodyRows().length) * 26}px`);
  });
});
