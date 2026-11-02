import { DOCUMENT } from '@angular/common';
import { Pipe, PipeTransform, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

const SCRIPT_TAGS = 'script, noscript, iframe, object, embed, base';
const URL_ATTRS = ['href', 'src', 'xlink:href', 'action', 'formaction'];
const SCRIPT_URL = /^\s*(javascript|vbscript|data:text\/html)/i;

/**
 * Renders HTML produced by the app's own cell renderers without Angular's
 * sanitizer stripping inline styles. Script content (script tags, on* event
 * handlers, javascript: URLs) is removed; all other markup is kept as-is.
 */
@Pipe({ name: 'uiSafeHtml' })
export class UiSafeHtmlPipe implements PipeTransform {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly document = inject(DOCUMENT);

  transform(html: unknown): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(this.stripScripts(`${html ?? ''}`));
  }

  private stripScripts(html: string): string {
    if (!html) return html;

    // <template> content is inert: nothing in it runs or loads while we clean it.
    const template = this.document.createElement('template');
    template.innerHTML = html;
    const root = template.content;

    root.querySelectorAll(SCRIPT_TAGS).forEach((el) => el.remove());

    root.querySelectorAll('*').forEach((el) => {
      for (const attr of Array.from(el.attributes)) {
        const name = attr.name.toLowerCase();
        if (name.startsWith('on') || (URL_ATTRS.includes(name) && SCRIPT_URL.test(attr.value))) {
          el.removeAttribute(attr.name);
        }
      }
    });

    return template.innerHTML;
  }
}
