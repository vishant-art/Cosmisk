import { Component } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { PITCH_DECK_HTML } from './pitch-deck-content';

@Component({
  selector: 'app-pitch-deck',
  standalone: true,
  template: `
    <iframe [srcdoc]="deckHtml" class="pitch-frame"></iframe>
  `,
  styles: [`
    :host {
      display: block;
      width: 100vw;
      height: 100vh;
      overflow: hidden;
    }
    .pitch-frame {
      width: 100%;
      height: 100%;
      border: none;
    }
  `]
})
export default class PitchDeckComponent {
  deckHtml: SafeHtml;

  constructor(private sanitizer: DomSanitizer) {
    this.deckHtml = this.sanitizer.bypassSecurityTrustHtml(PITCH_DECK_HTML);
  }
}
