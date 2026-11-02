import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Select, SelectSearchEvent } from './select';

const CITIES = Array.from({ length: 1000 }, (_, i) => ({ id: i + 1, name: `City ${i + 1}` }));

@Component({
  imports: [Select, ReactiveFormsModule],
  template: `
    <ui-select
      [items]="items()"
      optionLabel="name"
      optionValue="id"
      disabledKey="off"
      [multiple]="multiple()"
      [virtualScroll]="virtual()"
      [allowClear]="true"
      [forceSearch]="true"
      [debounce]="0"
      [formControl]="control"
      (search)="searches.push($event)"
      (selected)="picked.push($event)"
    />
  `,
})
class Host {
  items = signal<any[]>(CITIES.slice(0, 5));
  multiple = signal(false);
  virtual = signal(true);
  control = new FormControl<any>(null);
  searches: SelectSearchEvent[] = [];
  picked: any[] = [];
}

describe('Select', () => {
  // jsdom does no layout, so it lacks the scrolling APIs the list calls.
  beforeAll(() => {
    Element.prototype.scrollTo ??= function () {};
    Element.prototype.scrollIntoView ??= function () {};
  });

  let fixture: ComponentFixture<Host>;
  let host: Host;

  const field = () => fixture.nativeElement.querySelector('input.ui-select__field') as HTMLInputElement;
  const options = () => Array.from(document.querySelectorAll<HTMLElement>('.ui-select__option[role="option"]'));
  const open = async () => {
    field().dispatchEvent(new Event('focus'));
    await fixture.whenStable();
  };
  const key = async (k: string) => {
    field().dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
    await fixture.whenStable();
  };
  const type = async (text: string) => {
    field().value = text;
    field().dispatchEvent(new InputEvent('input', { data: text.slice(-1) }));
    await fixture.whenStable();
  };

  const setModel = async (value: unknown) => {
    host.control.setValue(value);
    await fixture.whenStable();
  };

  beforeEach(async () => {
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    await fixture.whenStable();
  });

  afterEach(() => fixture.destroy());

  it('uses virtual scroll by default and renders only part of a long list', async () => {
    host.items.set(CITIES);
    await fixture.whenStable();
    await open();

    expect(document.querySelector('cdk-virtual-scroll-viewport')).toBeTruthy();
    expect(options().length).toBeGreaterThan(0);
    expect(options().length).toBeLessThan(CITIES.length);
  });

  it('renders every option when virtualScroll is off', async () => {
    host.virtual.set(false);
    host.items.set(CITIES.slice(0, 50));
    await fixture.whenStable();
    await open();

    expect(document.querySelector('cdk-virtual-scroll-viewport')).toBeNull();
    expect(options().length).toBe(50);
  });

  it('filters by the typed text', async () => {
    host.virtual.set(false);
    await fixture.whenStable();
    await open();
    await type('city 3');

    expect(options().map((o) => o.textContent?.trim())).toEqual(['City 3']);
  });

  it('picks with the keyboard and updates the form control', async () => {
    await open();
    await key('ArrowDown');
    await key('ArrowDown');
    await key('Enter');

    expect(host.control.value).toBe(2);
    expect(host.picked).toEqual([2]);
    expect(fixture.nativeElement.querySelector('.ui-select__value').textContent.trim()).toBe('City 2');
  });

  it('skips disabled options with the arrow keys', async () => {
    host.items.set([
      { id: 1, name: 'A', off: true },
      { id: 2, name: 'B' },
    ]);
    await fixture.whenStable();
    await open();
    await key('ArrowDown');
    await key('Enter');

    expect(host.control.value).toBe(2);
  });

  it('shows the model value written from outside', async () => {
    await setModel(3);

    expect(fixture.nativeElement.querySelector('.ui-select__value').textContent.trim()).toBe('City 3');
  });

  it('keeps several values in multi-select and removes a chip', async () => {
    host.multiple.set(true);
    host.virtual.set(false);
    await fixture.whenStable();
    await open();
    options()[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await fixture.whenStable();
    options()[2].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await fixture.whenStable();

    expect(host.control.value).toEqual([1, 3]);
    expect(fixture.nativeElement.querySelectorAll('.ui-select__chip').length).toBe(2);

    fixture.nativeElement
      .querySelector('.ui-select__chip-remove')
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await fixture.whenStable();
    expect(host.control.value).toEqual([3]);
  });

  it('asks the backend when nothing matches, then shows the new items', async () => {
    await open();
    await type('zzz');
    await new Promise((resolve) => setTimeout(resolve, 10)); // the debounce
    await fixture.whenStable();

    expect(host.searches).toEqual([{ lastCharacter: 'z', text: 'zzz', page: { offset: 0, limit: 20 } }]);
    expect(document.querySelector('.ui-select__spinner')).toBeTruthy();

    host.items.set([{ id: 99, name: 'zzz town' }]);
    await fixture.whenStable();
    expect(document.querySelector('.ui-select__spinner')).toBeNull();
    expect(options().map((o) => o.textContent?.trim())).toEqual(['zzz town']);
  });

  it('clears back to empty', async () => {
    await setModel(2);
    fixture.nativeElement
      .querySelector('.ui-select__clear')
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await fixture.whenStable();

    expect(host.control.value).toBeNull();
  });
});
