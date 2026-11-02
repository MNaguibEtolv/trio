import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Icon } from './icon';
import { UI_ICONS, provideUiIcons } from './icons';

@Component({
  imports: [Icon],
  template: `<ui-icon [name]="name()" [size]="size()" [label]="label()" />`,
})
class Host {
  name = signal('edit');
  size = signal<number | string>('1em');
  label = signal('');
}

describe('Icon', () => {
  let fixture: ComponentFixture<Host>;
  const icon = () => fixture.nativeElement.querySelector('ui-icon') as HTMLElement;
  const paths = () => [...icon().querySelectorAll('path')].map((p) => p.getAttribute('d'));

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [provideUiIcons({ plane: ['M2 16l20-6-20-6 4 6-4 6z'], edit: ['M0 0h1'] })],
    });
    fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
  });

  it('draws a built-in icon with the text colour', async () => {
    fixture.componentInstance.name.set('search');
    await fixture.whenStable();

    expect(paths()).toEqual([...UI_ICONS.search]);
    expect(icon().querySelector('svg')!.getAttribute('stroke')).toBe('currentColor');
  });

  it('uses registered icons, which override built-in names', async () => {
    expect(paths()).toEqual(['M0 0h1']);

    fixture.componentInstance.name.set('plane');
    await fixture.whenStable();
    expect(paths()).toEqual(['M2 16l20-6-20-6 4 6-4 6z']);
  });

  it('sizes in px for numbers and as-is for strings', async () => {
    expect(icon().style.width).toBe('1em');

    fixture.componentInstance.size.set(18);
    await fixture.whenStable();
    expect(icon().style.width).toBe('18px');
    expect(icon().style.height).toBe('18px');
  });

  it('is hidden from screen readers unless labelled', async () => {
    expect(icon().getAttribute('aria-hidden')).toBe('true');

    fixture.componentInstance.label.set('Edit');
    await fixture.whenStable();
    expect(icon().getAttribute('aria-hidden')).toBeNull();
    expect(icon().getAttribute('role')).toBe('img');
    expect(icon().getAttribute('aria-label')).toBe('Edit');
  });

  it('renders nothing for an unknown name', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    fixture.componentInstance.name.set('nope');
    await fixture.whenStable();

    expect(paths()).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
