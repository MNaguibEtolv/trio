import { Component, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

let nextId = 0;

@Component({
  selector: 'ui-input',
  styleUrl: './input.scss',
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => Input), multi: true }],
  template: `
    @if (label()) {
      <label class="ui-input__label" [for]="id">{{ label() }}</label>
    }
    <input
      class="ui-input__field"
      [class.ui-input__field--invalid]="error()"
      [id]="id"
      [type]="type()"
      [placeholder]="placeholder()"
      [value]="value()"
      [disabled]="isDisabled()"
      [attr.aria-invalid]="!!error()"
      (input)="onInput($event)"
      (blur)="onTouched()"
    />
    @if (error()) {
      <small class="ui-input__error">{{ error() }}</small>
    } @else if (hint()) {
      <small class="ui-input__hint">{{ hint() }}</small>
    }
  `,
})
export class Input implements ControlValueAccessor {
  readonly label = input('');
  readonly type = input('text');
  readonly placeholder = input('');
  readonly hint = input('');
  readonly error = input('');

  protected readonly id = `ui-input-${nextId++}`;
  protected readonly value = signal('');
  protected readonly isDisabled = signal(false);

  private onChange: (value: string) => void = () => {};
  protected onTouched: () => void = () => {};

  protected onInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.value.set(value);
    this.onChange(value);
  }

  writeValue(value: string | null): void {
    this.value.set(value ?? '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.isDisabled.set(isDisabled);
  }
}
