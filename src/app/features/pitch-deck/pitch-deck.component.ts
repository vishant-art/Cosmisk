import { Component, OnInit } from '@angular/core';
import { PITCH_DECK_PDF_BASE64 } from './pitch-deck-pdf';

@Component({
  selector: 'app-pitch-deck',
  standalone: true,
  template: `
    <div class="download-page">
      <h2>Cosmisk — Investor Pitch Deck</h2>
      <p>Your download should start automatically.</p>
      <p>If not, <a (click)="download()" style="color: #E74C3C; cursor: pointer; text-decoration: underline;">click here to download</a>.</p>
    </div>
  `,
  styles: [`
    .download-page {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      font-family: 'DM Sans', sans-serif;
      color: #1B2A4A;
      background: #FAF8F5;
    }
    h2 { margin-bottom: 12px; }
    p { color: #666; font-size: 14px; }
  `]
})
export default class PitchDeckComponent implements OnInit {
  ngOnInit() {
    this.download();
  }

  download() {
    const byteCharacters = atob(PITCH_DECK_PDF_BASE64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Cosmisk-Pitch-Deck.pdf';
    a.click();
    URL.revokeObjectURL(url);
  }
}
