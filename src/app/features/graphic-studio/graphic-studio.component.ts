const _BUILD_VER = '2026-02-13-v2';
import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-graphic-studio',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="space-y-6">
      <div>
        <h1 class="text-page-title font-display text-navy m-0">Graphic Studio</h1>
        <p class="text-sm text-gray-500 font-body mt-1 mb-0">AI-powered static ad creation</p>
      </div>

      <div class="grid md:grid-cols-5 gap-6 min-h-[70vh]">
        <!-- Left Panel: Config -->
        <div class="md:col-span-2 space-y-4">
          <!-- Upload Area -->
          <div class="bg-white rounded-card shadow-card p-5">
            <h3 class="text-sm font-display text-navy mb-3 mt-0">Product Image</h3>
            <div class="border-2 border-dashed border-gray-200 rounded-lg p-8 text-center hover:border-accent/50 transition-colors cursor-pointer">
              <span class="text-3xl block mb-2">📸</span>
              <p class="text-xs text-gray-500 font-body mb-1">Drag & drop or click to upload</p>
              <p class="text-[10px] text-gray-400 font-body m-0">PNG, JPG, WebP up to 10MB</p>
            </div>
          </div>

          <!-- Text Inputs -->
          <div class="bg-white rounded-card shadow-card p-5 space-y-3">
            <h3 class="text-sm font-display text-navy mb-3 mt-0">Ad Copy</h3>
            <div>
              <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Headline</label>
              <input [(ngModel)]="headline" placeholder="e.g., Glow Up in 14 Days"
                class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-body focus:ring-2 focus:ring-accent/30 focus:border-accent outline-none" />
            </div>
            <div>
              <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Subheadline</label>
              <input [(ngModel)]="subheadline" placeholder="e.g., Marine Collagen + Hyaluronic Acid"
                class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-body focus:ring-2 focus:ring-accent/30 focus:border-accent outline-none" />
            </div>
            <div>
              <label class="text-xs font-body font-semibold text-gray-700 block mb-1">CTA Button</label>
              <input [(ngModel)]="cta" placeholder="e.g., Shop Now at 40% Off"
                class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-body focus:ring-2 focus:ring-accent/30 focus:border-accent outline-none" />
            </div>
          </div>

          <!-- Template Grid -->
          <div class="bg-white rounded-card shadow-card p-5">
            <h3 class="text-sm font-display text-navy mb-3 mt-0">Template</h3>
            <div class="grid grid-cols-3 gap-2">
              @for (tmpl of templates; track tmpl.id) {
                <div
                  (click)="selectedTemplate.set(tmpl.id)"
                  class="aspect-square rounded-lg border-2 cursor-pointer transition-all flex flex-col items-center justify-center gap-1"
                  [ngClass]="selectedTemplate() === tmpl.id ? 'border-accent bg-accent/5' : 'border-gray-200 hover:border-gray-300'"
                  [style.background-color]="tmpl.bg">
                  <span class="text-lg">{{ tmpl.icon }}</span>
                  <span class="text-[10px] font-body text-gray-600">{{ tmpl.name }}</span>
                </div>
              }
            </div>
          </div>

          <button class="w-full px-5 py-2.5 bg-accent text-white rounded-pill text-sm font-body font-semibold hover:bg-accent/90 transition-colors">
            Generate Ad
          </button>
        </div>

        <!-- Right Panel: Preview -->
        <div class="md:col-span-3">
          <div class="bg-white rounded-card shadow-card p-5 sticky top-24">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-sm font-display text-navy m-0">Preview</h3>
              <div class="flex bg-gray-100 rounded-pill overflow-hidden">
                @for (fmt of previewFormats; track fmt) {
                  <button
                    (click)="activeFormat = fmt"
                    class="px-3 py-1 text-[10px] font-body transition-colors"
                    [ngClass]="activeFormat === fmt ? 'bg-accent text-white' : 'text-gray-500'">
                    {{ fmt }}
                  </button>
                }
              </div>
            </div>

            <div class="flex justify-center">
              <div class="rounded-xl overflow-hidden shadow-lg transition-all"
                [ngClass]="{
                  'w-[320px] aspect-square': activeFormat === 'Feed',
                  'w-[240px] aspect-[9/16]': activeFormat === 'Story',
                  'w-full aspect-video max-w-lg': activeFormat === 'Landscape'
                }">
                <div class="w-full h-full flex flex-col items-center justify-center p-6 relative"
                  [style.background]="getTemplateBg()">
                  @if (headline || subheadline || cta) {
                    <div class="text-center space-y-3">
                      @if (headline) {
                        <h2 class="text-xl font-display text-white m-0 drop-shadow-lg">{{ headline }}</h2>
                      }
                      @if (subheadline) {
                        <p class="text-sm font-body text-white/80 m-0">{{ subheadline }}</p>
                      }
                      <div class="w-24 h-24 bg-white/20 rounded-lg mx-auto flex items-center justify-center">
                        <span class="text-3xl">📦</span>
                      </div>
                      @if (cta) {
                        <button class="px-6 py-2 bg-white text-navy rounded-pill text-sm font-body font-bold shadow-lg">
                          {{ cta }}
                        </button>
                      }
                    </div>
                  } @else {
                    <div class="text-center">
                      <span class="text-4xl block mb-3 opacity-50">🖼️</span>
                      <p class="text-sm text-white/60 font-body">Fill in the details to see preview</p>
                    </div>
                  }
                </div>
              </div>
            </div>

            <div class="flex gap-3 mt-4 justify-center">
              <button class="px-4 py-2 border border-gray-200 rounded-pill text-xs font-body text-gray-600 hover:bg-gray-50">
                Download PNG
              </button>
              <button class="px-4 py-2 border border-gray-200 rounded-pill text-xs font-body text-gray-600 hover:bg-gray-50">
                Export All Sizes
              </button>
              <button class="px-4 py-2 bg-accent text-white rounded-pill text-xs font-body font-semibold">
                Send to Campaign
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `
})
export default class GraphicStudioComponent {
  headline = '';
  subheadline = '';
  cta = '';
  selectedTemplate = signal('t-1');
  activeFormat = 'Feed';
  previewFormats = ['Feed', 'Story', 'Landscape'];

  templates = [
    { id: 't-1', name: 'Minimal', icon: '⬜', bg: '#f8fafc' },
    { id: 't-2', name: 'Bold', icon: '🟧', bg: '#fef3c7' },
    { id: 't-3', name: 'Dark', icon: '⬛', bg: '#1e293b' },
    { id: 't-4', name: 'Gradient', icon: '🌈', bg: '#ede9fe' },
    { id: 't-5', name: 'Split', icon: '◐', bg: '#ecfdf5' },
    { id: 't-6', name: 'Overlay', icon: '🔲', bg: '#fee2e2' },
  ];

  getTemplateBg(): string {
    const gradients: Record<string, string> = {
      't-1': 'linear-gradient(135deg, #667eea, #764ba2)',
      't-2': 'linear-gradient(135deg, #f59e0b, #ef4444)',
      't-3': 'linear-gradient(135deg, #0f172a, #1e293b)',
      't-4': 'linear-gradient(135deg, #a78bfa, #ec4899)',
      't-5': 'linear-gradient(135deg, #10b981, #3b82f6)',
      't-6': 'linear-gradient(135deg, #ef4444, #dc2626)',
    };
    return gradients[this.selectedTemplate()] ?? gradients['t-1'];
  }
}
