const _BUILD_VER = '2026-03-05-v2';
import { Component, signal, ViewChild, ElementRef, inject, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ToastService } from '../../core/services/toast.service';
import { MediaGenService } from '../../core/services/media-gen.service';
import { Subscription } from 'rxjs';
import html2canvas from 'html2canvas';

type StudioMode = 'template' | 'ai-image' | 'ai-video';
type GenStatus = 'idle' | 'generating' | 'done' | 'error';

@Component({
  selector: 'app-graphic-studio',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  template: `
    <div class="space-y-6">
      <div>
        <h1 class="text-page-title font-display text-navy m-0">Graphic Studio</h1>
        <p class="text-sm text-gray-500 font-body mt-1 mb-0">Create static ads, AI images, and AI videos</p>
      </div>

      <!-- Mode Tabs -->
      <div class="flex bg-white rounded-card shadow-card p-1 gap-1 max-w-lg">
        @for (mode of modes; track mode.id) {
          <button
            (click)="activeMode.set(mode.id)"
            class="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-body transition-all"
            [ngClass]="activeMode() === mode.id
              ? 'bg-accent text-white font-semibold shadow-sm'
              : 'text-gray-500 hover:text-navy hover:bg-gray-50'">
            <lucide-icon [name]="mode.icon" [size]="16"></lucide-icon>
            {{ mode.label }}
          </button>
        }
      </div>

      <!-- ========== TEMPLATE BUILDER MODE ========== -->
      @if (activeMode() === 'template') {
        <div class="grid md:grid-cols-5 gap-6 min-h-[60vh]">
          <div class="md:col-span-2 space-y-4">
            <!-- Upload Area -->
            <div class="bg-white rounded-card shadow-card p-5">
              <h3 class="text-sm font-display text-navy mb-3 mt-0">Product Image</h3>
              <div
                (click)="fileInput.click()"
                (dragover)="onDragOver($event)"
                (drop)="onDrop($event)"
                class="border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer"
                [ngClass]="productImageUrl() ? 'border-accent/40 bg-accent/5' : 'border-gray-200 hover:border-accent/50'">
                @if (productImageUrl()) {
                  <img [src]="productImageUrl()" class="w-20 h-20 object-contain mx-auto rounded-lg mb-2" alt="Product" />
                  <p class="text-xs text-accent font-body mb-0">Click to change</p>
                } @else {
                  <lucide-icon name="camera" [size]="24" class="mx-auto mb-2 text-gray-400"></lucide-icon>
                  <p class="text-xs text-gray-500 font-body mb-1">Drag & drop or click</p>
                  <p class="text-[10px] text-gray-400 font-body m-0">PNG, JPG, WebP up to 10MB</p>
                }
                <input #fileInput type="file" accept="image/png,image/jpeg,image/webp" (change)="onFileSelected($event)" class="hidden" />
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

            <button
              (click)="generateTemplateAd()"
              [disabled]="!headline.trim()"
              class="w-full px-5 py-2.5 bg-accent text-white rounded-pill text-sm font-body font-semibold hover:bg-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              Generate Ad
            </button>
          </div>

          <!-- Template Preview -->
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
                <div #previewEl class="rounded-xl overflow-hidden shadow-lg transition-all"
                  [ngClass]="{
                    'w-[320px] aspect-square': activeFormat === 'Feed',
                    'w-[240px] aspect-[9/16]': activeFormat === 'Story',
                    'w-full aspect-video max-w-lg': activeFormat === 'Landscape'
                  }">
                  <div class="w-full h-full flex flex-col items-center justify-center p-6 relative"
                    [style.background]="getTemplateBg()">
                    @if (headline || subheadline || cta || productImageUrl()) {
                      <div class="text-center space-y-3">
                        @if (headline) {
                          <h2 class="text-xl font-display text-white m-0 drop-shadow-lg">{{ headline }}</h2>
                        }
                        @if (subheadline) {
                          <p class="text-sm font-body text-white/80 m-0">{{ subheadline }}</p>
                        }
                        @if (productImageUrl()) {
                          <div class="w-28 h-28 mx-auto flex items-center justify-center">
                            <img [src]="productImageUrl()" class="max-w-full max-h-full object-contain rounded-lg drop-shadow-lg" alt="Product" />
                          </div>
                        } @else {
                          <div class="w-24 h-24 bg-white/20 rounded-lg mx-auto flex items-center justify-center">
                            <lucide-icon name="package" [size]="28" class="text-white/80"></lucide-icon>
                          </div>
                        }
                        @if (cta) {
                          <button class="px-6 py-2 bg-white text-navy rounded-pill text-sm font-body font-bold shadow-lg">
                            {{ cta }}
                          </button>
                        }
                      </div>
                    } @else {
                      <div class="text-center">
                        <lucide-icon name="image" [size]="36" class="mx-auto mb-3 opacity-50 text-white"></lucide-icon>
                        <p class="text-sm text-white/60 font-body">Fill in the details to see preview</p>
                      </div>
                    }
                  </div>
                </div>
              </div>
              <div class="flex gap-3 mt-4 justify-center">
                <button (click)="downloadPng()" [disabled]="!templateGenerated()"
                  class="px-4 py-2 border border-gray-200 rounded-pill text-xs font-body text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
                  Download PNG
                </button>
                <button (click)="exportAllSizes()" [disabled]="!templateGenerated()"
                  class="px-4 py-2 border border-gray-200 rounded-pill text-xs font-body text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
                  Export All Sizes
                </button>
              </div>
            </div>
          </div>
        </div>
      }

      <!-- ========== AI IMAGE GEN MODE ========== -->
      @if (activeMode() === 'ai-image') {
        <div class="grid md:grid-cols-5 gap-6 min-h-[60vh]">
          <div class="md:col-span-2 space-y-4">
            <div class="bg-white rounded-card shadow-card p-5 space-y-4">
              <h3 class="text-sm font-display text-navy mb-0 mt-0">Describe your ad image</h3>
              <div>
                <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Image Prompt</label>
                <textarea [(ngModel)]="imagePrompt" rows="4"
                  placeholder="A product shot of skincare serum on a marble surface with soft golden light, luxury feel, clean background..."
                  class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-body focus:ring-2 focus:ring-accent/30 focus:border-accent outline-none resize-none"></textarea>
              </div>
              <div>
                <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Style</label>
                <select [(ngModel)]="imageStyle"
                  class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-body focus:ring-2 focus:ring-accent/30 focus:border-accent outline-none">
                  <option value="photorealistic">Photorealistic</option>
                  <option value="illustration">Illustration</option>
                  <option value="3d-render">3D Render</option>
                  <option value="flat-design">Flat Design</option>
                  <option value="watercolor">Watercolor</option>
                  <option value="minimal">Minimal / Clean</option>
                </select>
              </div>
              <div>
                <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Aspect Ratio</label>
                <div class="grid grid-cols-3 gap-2">
                  @for (ar of aspectRatios; track ar.value) {
                    <button (click)="imageAspectRatio = ar.value"
                      class="px-3 py-2 border rounded-lg text-xs font-body transition-all text-center"
                      [ngClass]="imageAspectRatio === ar.value ? 'border-accent bg-accent/5 text-accent font-semibold' : 'border-gray-200 text-gray-600 hover:border-gray-300'">
                      {{ ar.label }}
                    </button>
                  }
                </div>
              </div>
              <div>
                <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Reference Image (optional)</label>
                <div
                  (click)="refImageInput.click()"
                  (dragover)="onDragOver($event)"
                  (drop)="onDropRefImage($event)"
                  class="border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer"
                  [ngClass]="refImageUrl() ? 'border-accent/40 bg-accent/5' : 'border-gray-200 hover:border-accent/50'">
                  @if (refImageUrl()) {
                    <img [src]="refImageUrl()" class="w-16 h-16 object-contain mx-auto rounded mb-1" alt="Reference" />
                    <p class="text-[10px] text-accent font-body mb-0">Click to change</p>
                  } @else {
                    <p class="text-xs text-gray-400 font-body m-0">Upload a reference image for style guidance</p>
                  }
                  <input #refImageInput type="file" accept="image/*" (change)="onRefImageSelected($event)" class="hidden" />
                </div>
              </div>
            </div>

            <button
              (click)="generateAiImage()"
              [disabled]="!imagePrompt.trim() || imageGenStatus() === 'generating'"
              class="w-full px-5 py-2.5 bg-accent text-white rounded-pill text-sm font-body font-semibold hover:bg-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
              @if (imageGenStatus() === 'generating') {
                <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Generating...
              } @else {
                <lucide-icon name="sparkles" [size]="16"></lucide-icon>
                Generate Image
              }
            </button>
          </div>

          <!-- AI Image Result -->
          <div class="md:col-span-3">
            <div class="bg-white rounded-card shadow-card p-5 sticky top-24">
              <h3 class="text-sm font-display text-navy mb-4 mt-0">Generated Image</h3>
              <div class="flex justify-center">
                <div class="w-full max-w-md rounded-xl overflow-hidden shadow-lg bg-gray-50 flex items-center justify-center"
                  [ngClass]="imageAspectRatio === '1:1' ? 'aspect-square' : imageAspectRatio === '9:16' ? 'aspect-[9/16] max-w-xs' : 'aspect-video'">
                  @if (imageGenStatus() === 'generating') {
                    <div class="text-center p-8">
                      <div class="w-12 h-12 border-3 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                      <p class="text-sm font-body text-gray-500">Generating your image...</p>
                      <p class="text-xs font-body text-gray-400 mt-1">This typically takes 10-30 seconds</p>
                    </div>
                  } @else if (imageGenStatus() === 'done' && generatedImageUrl()) {
                    <img [src]="generatedImageUrl()" class="w-full h-full object-cover" alt="Generated" />
                  } @else if (imageGenStatus() === 'error') {
                    <div class="text-center p-8">
                      <lucide-icon name="alert-circle" [size]="32" class="mx-auto mb-3 text-red-400"></lucide-icon>
                      <p class="text-sm font-body text-red-500">Generation failed</p>
                      <p class="text-xs font-body text-gray-400 mt-1">Image generation API not yet configured. Connect your API key in Settings to enable.</p>
                    </div>
                  } @else {
                    <div class="text-center p-8">
                      <lucide-icon name="image-plus" [size]="36" class="mx-auto mb-3 text-gray-300"></lucide-icon>
                      <p class="text-sm font-body text-gray-400">Describe your image and click Generate</p>
                      <p class="text-xs font-body text-gray-300 mt-1">Powered by AI image generation</p>
                    </div>
                  }
                </div>
              </div>
              @if (imageGenStatus() === 'done' && generatedImageUrl()) {
                <div class="flex gap-3 mt-4 justify-center">
                  <button (click)="downloadGenerated('image')"
                    class="px-4 py-2 border border-gray-200 rounded-pill text-xs font-body text-gray-600 hover:bg-gray-50">
                    Download PNG
                  </button>
                  <button (click)="generateVariations()"
                    class="px-4 py-2 bg-accent text-white rounded-pill text-xs font-body font-semibold">
                    Generate Variations
                  </button>
                </div>
              }
            </div>
          </div>
        </div>
      }

      <!-- ========== AI VIDEO GEN MODE ========== -->
      @if (activeMode() === 'ai-video') {
        <div class="grid md:grid-cols-5 gap-6 min-h-[60vh]">
          <div class="md:col-span-2 space-y-4">
            <div class="bg-white rounded-card shadow-card p-5 space-y-4">
              <h3 class="text-sm font-display text-navy mb-0 mt-0">Create AI Video Ad</h3>
              <div>
                <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Video Script</label>
                <textarea [(ngModel)]="videoScript" rows="5"
                  placeholder="Write or paste your video script here. Each line becomes a scene..."
                  class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-body focus:ring-2 focus:ring-accent/30 focus:border-accent outline-none resize-none"></textarea>
              </div>
              <div>
                <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Avatar / Presenter</label>
                <div class="grid grid-cols-3 gap-2">
                  @for (avatar of videoAvatars; track avatar.id) {
                    <button (click)="selectedAvatar = avatar.id"
                      class="p-2 border rounded-lg text-center transition-all"
                      [ngClass]="selectedAvatar === avatar.id ? 'border-accent bg-accent/5' : 'border-gray-200 hover:border-gray-300'">
                      <div class="w-10 h-10 rounded-full mx-auto mb-1 flex items-center justify-center text-lg"
                        [style.background-color]="avatar.color">
                        {{ avatar.emoji }}
                      </div>
                      <span class="text-[10px] font-body text-gray-600 block">{{ avatar.name }}</span>
                    </button>
                  }
                </div>
              </div>
              <div>
                <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Duration</label>
                <div class="grid grid-cols-3 gap-2">
                  @for (dur of videoDurations; track dur) {
                    <button (click)="videoDuration = dur"
                      class="px-3 py-2 border rounded-lg text-xs font-body transition-all text-center"
                      [ngClass]="videoDuration === dur ? 'border-accent bg-accent/5 text-accent font-semibold' : 'border-gray-200 text-gray-600 hover:border-gray-300'">
                      {{ dur }}
                    </button>
                  }
                </div>
              </div>
              <div>
                <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Aspect Ratio</label>
                <div class="grid grid-cols-3 gap-2">
                  @for (ar of aspectRatios; track ar.value) {
                    <button (click)="videoAspectRatio = ar.value"
                      class="px-3 py-2 border rounded-lg text-xs font-body transition-all text-center"
                      [ngClass]="videoAspectRatio === ar.value ? 'border-accent bg-accent/5 text-accent font-semibold' : 'border-gray-200 text-gray-600 hover:border-gray-300'">
                      {{ ar.label }}
                    </button>
                  }
                </div>
              </div>
            </div>

            <button
              (click)="generateAiVideo()"
              [disabled]="!videoScript.trim() || videoGenStatus() === 'generating'"
              class="w-full px-5 py-2.5 bg-accent text-white rounded-pill text-sm font-body font-semibold hover:bg-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
              @if (videoGenStatus() === 'generating') {
                <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Generating...
              } @else {
                <lucide-icon name="video" [size]="16"></lucide-icon>
                Generate Video
              }
            </button>
          </div>

          <!-- AI Video Result -->
          <div class="md:col-span-3">
            <div class="bg-white rounded-card shadow-card p-5 sticky top-24">
              <h3 class="text-sm font-display text-navy mb-4 mt-0">Generated Video</h3>
              <div class="flex justify-center">
                <div class="w-full max-w-md rounded-xl overflow-hidden shadow-lg bg-gray-900 flex items-center justify-center"
                  [ngClass]="videoAspectRatio === '1:1' ? 'aspect-square' : videoAspectRatio === '9:16' ? 'aspect-[9/16] max-w-xs' : 'aspect-video'">
                  @if (videoGenStatus() === 'generating') {
                    <div class="text-center p-8">
                      <div class="w-12 h-12 border-3 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                      <p class="text-sm font-body text-gray-300">Generating your video...</p>
                      <p class="text-xs font-body text-gray-500 mt-1">Video generation typically takes 1-3 minutes</p>
                    </div>
                  } @else if (videoGenStatus() === 'done' && generatedVideoUrl()) {
                    <video [src]="generatedVideoUrl()" controls class="w-full h-full object-cover"></video>
                  } @else if (videoGenStatus() === 'error') {
                    <div class="text-center p-8">
                      <lucide-icon name="alert-circle" [size]="32" class="mx-auto mb-3 text-red-400"></lucide-icon>
                      <p class="text-sm font-body text-red-400">Generation failed</p>
                      <p class="text-xs font-body text-gray-500 mt-1">Video generation API not yet configured. Connect your API key in Settings to enable.</p>
                    </div>
                  } @else {
                    <div class="text-center p-8">
                      <lucide-icon name="clapperboard" [size]="36" class="mx-auto mb-3 text-gray-600"></lucide-icon>
                      <p class="text-sm font-body text-gray-400">Write your script and click Generate</p>
                      <p class="text-xs font-body text-gray-600 mt-1">AI avatar will perform your script</p>
                    </div>
                  }
                </div>
              </div>
              @if (videoGenStatus() === 'done' && generatedVideoUrl()) {
                <div class="flex gap-3 mt-4 justify-center">
                  <button (click)="downloadGenerated('video')"
                    class="px-4 py-2 border border-gray-200 rounded-pill text-xs font-body text-gray-600 hover:bg-gray-50">
                    Download MP4
                  </button>
                  <button class="px-4 py-2 bg-accent text-white rounded-pill text-xs font-body font-semibold">
                    Send to Campaign
                  </button>
                </div>
              }
            </div>
          </div>
        </div>
      }
    </div>
  `
})
export default class GraphicStudioComponent implements OnDestroy {
  @ViewChild('previewEl') previewEl!: ElementRef;
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('refImageInput') refImageInput!: ElementRef<HTMLInputElement>;
  private toast = inject(ToastService);
  private mediaGen = inject(MediaGenService);
  private subscriptions: Subscription[] = [];

  // Mode
  activeMode = signal<StudioMode>('template');
  modes = [
    { id: 'template' as StudioMode, label: 'Template', icon: 'layout-template' },
    { id: 'ai-image' as StudioMode, label: 'AI Image', icon: 'image-plus' },
    { id: 'ai-video' as StudioMode, label: 'AI Video', icon: 'video' },
  ];

  // Template builder state
  headline = '';
  subheadline = '';
  cta = '';
  selectedTemplate = signal('t-1');
  productImageUrl = signal<string | null>(null);
  templateGenerated = signal(false);
  activeFormat = 'Feed';
  previewFormats = ['Feed', 'Story', 'Landscape'];
  templates = [
    { id: 't-1', name: 'Minimal', icon: '\u2B1C', bg: '#f8fafc' },
    { id: 't-2', name: 'Bold', icon: '\uD83D\uDFE7', bg: '#fef3c7' },
    { id: 't-3', name: 'Dark', icon: '\u2B1B', bg: '#1e293b' },
    { id: 't-4', name: 'Gradient', icon: '\uD83C\uDF08', bg: '#ede9fe' },
    { id: 't-5', name: 'Split', icon: '\u25D0', bg: '#ecfdf5' },
    { id: 't-6', name: 'Overlay', icon: '\uD83D\uDD32', bg: '#fee2e2' },
  ];

  // AI Image state
  imagePrompt = '';
  imageStyle = 'photorealistic';
  imageAspectRatio = '1:1';
  refImageUrl = signal<string | null>(null);
  imageGenStatus = signal<GenStatus>('idle');
  generatedImageUrl = signal<string | null>(null);
  aspectRatios = [
    { value: '1:1', label: '1:1 Feed' },
    { value: '9:16', label: '9:16 Story' },
    { value: '16:9', label: '16:9 Landscape' },
  ];

  // AI Video state
  videoScript = '';
  selectedAvatar = 'sophia';
  videoDuration = '30s';
  videoAspectRatio = '9:16';
  videoGenStatus = signal<GenStatus>('idle');
  generatedVideoUrl = signal<string | null>(null);
  videoAvatars = [
    { id: 'sophia', name: 'Sophia', emoji: '\uD83D\uDC69', color: '#fce7f3' },
    { id: 'marcus', name: 'Marcus', emoji: '\uD83D\uDC68', color: '#dbeafe' },
    { id: 'aisha', name: 'Aisha', emoji: '\uD83D\uDC69\u200D\uD83E\uDDB1', color: '#fef3c7' },
    { id: 'jake', name: 'Jake', emoji: '\uD83E\uDDD4', color: '#d1fae5' },
    { id: 'priya', name: 'Priya', emoji: '\uD83D\uDC69\u200D\uD83C\uDFEB', color: '#ede9fe' },
    { id: 'chris', name: 'Chris', emoji: '\uD83D\uDC68\u200D\uD83D\uDCBC', color: '#fee2e2' },
  ];
  videoDurations = ['15s', '30s', '60s'];

  // -------- Template Builder Methods --------
  onDragOver(event: DragEvent) { event.preventDefault(); event.stopPropagation(); }

  onDrop(event: DragEvent) {
    event.preventDefault(); event.stopPropagation();
    const file = event.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('image/')) this.loadImage(file, 'product');
  }

  onDropRefImage(event: DragEvent) {
    event.preventDefault(); event.stopPropagation();
    const file = event.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('image/')) this.loadImage(file, 'ref');
  }

  onFileSelected(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) this.loadImage(file, 'product');
  }

  onRefImageSelected(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) this.loadImage(file, 'ref');
  }

  private loadImage(file: File, target: 'product' | 'ref') {
    if (file.size > 10 * 1024 * 1024) {
      this.toast.error('Too Large', 'Image must be under 10MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result as string;
      if (target === 'product') this.productImageUrl.set(url);
      else this.refImageUrl.set(url);
    };
    reader.readAsDataURL(file);
  }

  generateTemplateAd() {
    if (!this.headline.trim()) {
      this.toast.error('Missing', 'Enter a headline to generate your ad');
      return;
    }
    this.templateGenerated.set(true);
    this.toast.success('Generated', 'Your ad is ready. Download or export below.');
  }

  async downloadPng() {
    if (!this.previewEl) return;
    try {
      const canvas = await html2canvas(this.previewEl.nativeElement, { backgroundColor: null, scale: 2, useCORS: true });
      const link = document.createElement('a');
      link.download = `cosmisk-ad-${this.activeFormat.toLowerCase()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch {
      this.toast.error('Error', 'Could not export image');
    }
  }

  async exportAllSizes() {
    const formats = ['Feed', 'Story', 'Landscape'];
    const original = this.activeFormat;
    for (const fmt of formats) {
      this.activeFormat = fmt;
      await new Promise(r => setTimeout(r, 200));
      try {
        const canvas = await html2canvas(this.previewEl.nativeElement, { backgroundColor: null, scale: 2, useCORS: true });
        const link = document.createElement('a');
        link.download = `cosmisk-ad-${fmt.toLowerCase()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
      } catch { /* skip */ }
    }
    this.activeFormat = original;
    this.toast.success('Exported', 'All 3 sizes downloaded');
  }

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

  // -------- AI Image Gen Methods --------
  generateAiImage() {
    if (!this.imagePrompt.trim()) return;
    this.imageGenStatus.set('generating');
    this.generatedImageUrl.set(null);

    const sub = this.mediaGen.generateImage({
      prompt: this.imagePrompt,
      style: this.imageStyle,
      aspect_ratio: this.imageAspectRatio,
      reference_image_url: this.refImageUrl() || undefined,
    }).subscribe({
      next: (res) => {
        if (res.success && res.image_url) {
          this.generatedImageUrl.set(res.image_url);
          this.imageGenStatus.set('done');
          this.toast.success('Generated', 'Your AI image is ready');
        } else {
          this.imageGenStatus.set('error');
          this.toast.error('Failed', res.error || 'Image generation failed');
        }
      },
      error: (err) => {
        this.imageGenStatus.set('error');
        const msg = err.error?.error || err.message || 'Image generation failed';
        this.toast.error('Error', msg);
      },
    });
    this.subscriptions.push(sub);
  }

  generateVariations() {
    if (!this.generatedImageUrl()) return;
    this.imageGenStatus.set('generating');

    const sub = this.mediaGen.generateImage({
      prompt: this.imagePrompt + ', variation with different composition',
      style: this.imageStyle,
      aspect_ratio: this.imageAspectRatio,
      reference_image_url: this.generatedImageUrl() || undefined,
    }).subscribe({
      next: (res) => {
        if (res.success && res.image_url) {
          this.generatedImageUrl.set(res.image_url);
          this.imageGenStatus.set('done');
          this.toast.success('Generated', 'New variation ready');
        } else {
          this.imageGenStatus.set('done'); // keep previous image visible
          this.toast.error('Failed', res.error || 'Variation generation failed');
        }
      },
      error: () => {
        this.imageGenStatus.set('done');
        this.toast.error('Error', 'Could not generate variation');
      },
    });
    this.subscriptions.push(sub);
  }

  // -------- AI Video Gen Methods --------
  generateAiVideo() {
    if (!this.videoScript.trim()) return;
    this.videoGenStatus.set('generating');
    this.generatedVideoUrl.set(null);

    const sub = this.mediaGen.generateVideo({
      script: this.videoScript,
      duration: this.videoDuration,
      aspect_ratio: this.videoAspectRatio,
      avatar: this.selectedAvatar,
    }).subscribe({
      next: (res) => {
        if (res.success && res.status === 'completed' && res.video_url) {
          this.generatedVideoUrl.set(res.video_url);
          this.videoGenStatus.set('done');
          this.toast.success('Generated', 'Your AI video is ready');
        } else if (res.success && res.status === 'processing' && res.generation_id) {
          // Start polling for async video generation
          this.pollVideoGeneration(res.generation_id);
        } else {
          this.videoGenStatus.set('error');
          this.toast.error('Failed', res.error || 'Video generation failed');
        }
      },
      error: (err) => {
        this.videoGenStatus.set('error');
        const msg = err.error?.error || err.message || 'Video generation failed';
        this.toast.error('Error', msg);
      },
    });
    this.subscriptions.push(sub);
  }

  private pollVideoGeneration(generationId: string) {
    const sub = this.mediaGen.pollVideoStatus(generationId).subscribe({
      next: (res) => {
        if (res.status === 'completed' && res.video_url) {
          this.generatedVideoUrl.set(res.video_url);
          this.videoGenStatus.set('done');
          this.toast.success('Generated', 'Your AI video is ready');
        } else if (res.status === 'failed') {
          this.videoGenStatus.set('error');
          this.toast.error('Failed', 'Video generation failed');
        }
        // 'processing' continues polling automatically via takeWhile
      },
      error: () => {
        this.videoGenStatus.set('error');
        this.toast.error('Error', 'Lost connection while generating video');
      },
    });
    this.subscriptions.push(sub);
  }

  ngOnDestroy() {
    this.subscriptions.forEach(s => s.unsubscribe());
  }

  // -------- Download Methods --------
  downloadGenerated(type: 'image' | 'video') {
    const url = type === 'image' ? this.generatedImageUrl() : this.generatedVideoUrl();
    if (!url) return;
    const link = document.createElement('a');
    link.download = `cosmisk-${type === 'image' ? 'ai-image.png' : 'ai-video.mp4'}`;
    link.href = url;
    link.click();
  }
}
