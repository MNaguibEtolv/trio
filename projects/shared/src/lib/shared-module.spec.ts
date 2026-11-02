import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SharedModule } from './shared-module';

@Component({
  imports: [SharedModule],
  template: `
    <ui-card title="Booking">
      <ui-input label="Name" />
      <ui-badge variant="success">Paid</ui-badge>
      <ui-spinner />
      <ui-button cardFooter>Save</ui-button>
    </ui-card>
  `,
})
class Host {}

describe('SharedModule', () => {
  it('renders all shared components', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;

    expect(el.querySelector('.ui-card__title')?.textContent).toBe('Booking');
    expect(el.querySelector('label')?.textContent).toBe('Name');
    expect(el.querySelector('ui-badge')?.classList).toContain('ui-badge--success');
    expect(el.querySelector('ui-spinner')).toBeTruthy();
    expect(el.querySelector('button')?.textContent?.trim()).toBe('Save');
  });
});
