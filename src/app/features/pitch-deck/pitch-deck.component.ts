import { Component } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

@Component({
  selector: 'app-pitch-deck',
  standalone: true,
  template: `
    <iframe [src]="deckUrl" class="pitch-frame"></iframe>
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
  deckUrl: SafeResourceUrl;

  constructor(private sanitizer: DomSanitizer) {
    this.deckUrl = this.sanitizer.bypassSecurityTrustResourceUrl('/assets/pitch-deck.html');
  }
}
