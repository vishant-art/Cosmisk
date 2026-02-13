import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-ugc-studio',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="max-w-4xl mx-auto py-12 text-center">
      <div class="w-20 h-20 mx-auto mb-6 bg-accent/10 rounded-full flex items-center justify-center">
        <span class="text-4xl">📹</span>
      </div>
      <h1 class="text-page-title font-display text-navy mb-3">UGC Studio</h1>
      <p class="text-gray-600 font-body mb-6 max-w-md mx-auto">Create AI avatar videos for your campaigns</p>
      <span class="inline-flex items-center gap-2 px-4 py-2 bg-accent/10 text-accent rounded-pill text-sm font-body font-medium">
        Coming Soon
      </span>
      <div class="mt-12 grid md:grid-cols-3 gap-6">
        <div class="bg-white rounded-card p-6 shadow-card text-left">
          <span class="text-2xl mb-3 block">🤖</span>
          <h3 class="text-sm font-body font-semibold text-navy mb-2">AI Avatars</h3>
          <p class="text-xs text-gray-500 font-body m-0">Choose from a library of realistic AI avatars tailored for Indian audiences.</p>
        </div>
        <div class="bg-white rounded-card p-6 shadow-card text-left">
          <span class="text-2xl mb-3 block">🗣️</span>
          <h3 class="text-sm font-body font-semibold text-navy mb-2">Multi-Language VO</h3>
          <p class="text-xs text-gray-500 font-body m-0">Generate voiceovers in Hindi, English, Tamil, and more with natural intonation.</p>
        </div>
        <div class="bg-white rounded-card p-6 shadow-card text-left">
          <span class="text-2xl mb-3 block">✂️</span>
          <h3 class="text-sm font-body font-semibold text-navy mb-2">Smart Editing</h3>
          <p class="text-xs text-gray-500 font-body m-0">Auto-cut, caption, and format videos for Reels, Stories, and Feed placements.</p>
        </div>
      </div>
    </div>
  `
})
export default class UgcStudioComponent {}
