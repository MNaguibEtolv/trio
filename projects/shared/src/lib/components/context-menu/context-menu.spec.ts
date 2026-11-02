import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ContextMenu } from './context-menu';
import { ContextMenuState } from './context-menu.types';

@Component({
  imports: [ContextMenu],
  template: `<ui-context-menu [state]="state()" (closed)="state.set(null)" />`,
})
class Host {
  state = signal<ContextMenuState | null>(null);
}

describe('ContextMenu', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;

  const menu = () => fixture.nativeElement.querySelector('.ui-context-menu') as HTMLElement | null;
  const labels = () =>
    [...fixture.nativeElement.querySelectorAll('.ui-context-menu__item')].map((i: Element) =>
      i.textContent?.trim(),
    );

  beforeEach(async () => {
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('renders nothing while closed', () => {
    expect(menu()).toBeNull();
  });

  it('lists items, flattening SubMenu groups', async () => {
    host.state.set({
      x: 10,
      y: 10,
      menu: { Edit: () => {}, More: { SubMenu: { Copy: () => {}, Print: { Action: () => {} } } } },
    });
    await fixture.whenStable();

    expect(labels()).toEqual(['Edit', 'Copy', 'Print']);
  });

  it('runs the action with the row it was opened for, then closes', async () => {
    const action = vi.fn();
    host.state.set({ x: 10, y: 10, row: { id: 7 }, index: 3, menu: { Delete: { Action: action } } });
    await fixture.whenStable();

    fixture.nativeElement.querySelector('.ui-context-menu__item').click();
    await fixture.whenStable();

    expect(action).toHaveBeenCalledWith({ id: 7 }, 3);
    expect(menu()).toBeNull();
  });

  it('anchors to the far edges near the bottom-right of the screen', async () => {
    host.state.set({ x: innerWidth - 5, y: innerHeight - 5, menu: { Edit: () => {} } });
    await fixture.whenStable();

    expect(menu()!.style.right).toBe('8px');
    expect(menu()!.style.bottom).toBe('8px');
    expect(menu()!.style.left).toBe('');
  });

  it('closes on Escape', async () => {
    host.state.set({ x: 10, y: 10, menu: { Edit: () => {} } });
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve)); // listeners attach after the opening event

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await fixture.whenStable();

    expect(menu()).toBeNull();
  });
});
