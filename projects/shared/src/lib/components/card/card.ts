import { Component, input } from '@angular/core';

@Component({
  selector: 'ui-card',
  styleUrl: './card.scss',
  template: `
    @if (title()) {
      <header class="ui-card__header">
        <h3 class="ui-card__title">{{ title() }}</h3>
        <ng-content select="[cardActions]" />
      </header>
    }
    <div class="ui-card__body">
      <ng-content />
    </div>
    <ng-content select="[cardFooter]" />
  `,
})
export class Card {
  readonly title = input('');
}
