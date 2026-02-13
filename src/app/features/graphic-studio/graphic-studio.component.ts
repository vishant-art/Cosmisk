import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-graphic-studio',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="max-w-4xl mx-auto py-12 text-center">
      <div class="w-20 h-20 mx-auto mb-6 bg-accent/10 rounded-full flex items-center justify-center">
        <span class="text-4xl">🖼️</span>
      </div>
      <h1 class="text-page-title font-display text-navy mb-3">Graphic Studio</h1>
      <p class="text-gray-600 font-body mb-6 max-w-md mx-auto">AI-powered static ad creation</p>
      <span class="inline-flex items-center gap-2 px-4 py-2 bg-accent/10 text-accent rounded-pill text-sm font-body font-medium">
        Coming Soon
      </span>
      <div class="mt-12 grid md:grid-cols-3 gap-6">
        <div class="bg-white rounded-card p-6 shadow-card text-left">
          <span class="text-2xl mb-3 block">🎨</span>
          <h3 class="text-sm font-body font-semibold text-navy mb-2">AI Image Generation</h3>
          <p class="text-xs text-gray-500 font-body m-0">Generate scroll-stopping static ads from text prompts and brand guidelines.</p>
        </div>
        <div class="bg-white rounded-card p-6 shadow-card text-left">
          <span class="text-2xl mb-3 block">📐</span>
          <h3 class="text-sm font-body font-semibold text-navy mb-2">Multi-Format Export</h3>
          <p class="text-xs text-gray-500 font-body m-0">Auto-resize designs for Feed, Story, Reels, and carousel placements.</p>
        </div>
        <div class="bg-white rounded-card p-6 shadow-card text-left">
          <span class="text-2xl mb-3 block">🔄</span>
          <h3 class="text-sm font-body font-semibold text-navy mb-2">Variant Generator</h3>
          <p class="text-xs text-gray-500 font-body m-0">Create dozens of ad variations from one base design for rapid testing.</p>
        </div>
      </div>
    </div>
  `
})
export default class GraphicStudioComponent {}
