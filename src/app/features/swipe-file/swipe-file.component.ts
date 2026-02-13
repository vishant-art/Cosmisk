import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DnaBadgeComponent } from '../../shared/components/dna-badge/dna-badge.component';

interface SwipeAd {
  id: string;
  brand: string;
  thumbnail: string;
  hookDna: string[];
  visualDna: string[];
  audioDna: string[];
  savedAt: string;
  notes: string;
  height: number;
}

@Component({
  selector: 'app-swipe-file',
  standalone: true,
  imports: [CommonModule, DnaBadgeComponent],
  template: `
    <div class="space-y-6">
      <div class="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 class="text-page-title font-display text-navy m-0">Swipe File</h1>
          <p class="text-sm text-gray-500 font-body mt-1 mb-0">Save and organize ad inspiration</p>
        </div>
        <div class="flex gap-3">
          <button class="px-4 py-2 border border-gray-200 rounded-pill text-sm font-body text-gray-600 hover:bg-gray-50 transition-colors">
            Save from URL
          </button>
          <button class="px-5 py-2.5 bg-accent text-white rounded-pill text-sm font-body font-semibold hover:bg-accent/90 transition-colors">
            Browse Meta Ad Library
          </button>
        </div>
      </div>

      <!-- Masonry Grid -->
      <div class="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4 space-y-4">
        @for (ad of savedAds; track ad.id) {
          <div class="break-inside-avoid bg-white rounded-card shadow-card overflow-hidden hover:shadow-card-hover transition-all">
            <!-- Thumbnail -->
            <div class="w-full flex items-center justify-center text-4xl"
              [style.height.px]="ad.height"
              [ngClass]="{
                'bg-gradient-to-br from-amber-50 to-amber-100': ad.hookDna.includes('Shock Statement'),
                'bg-gradient-to-br from-blue-50 to-blue-100': ad.hookDna.includes('Social Proof'),
                'bg-gradient-to-br from-green-50 to-green-100': ad.hookDna.includes('Transformation'),
                'bg-gradient-to-br from-purple-50 to-purple-100': ad.hookDna.includes('Authority'),
                'bg-gradient-to-br from-pink-50 to-pink-100': ad.hookDna.includes('Personal Story'),
                'bg-gradient-to-br from-red-50 to-red-100': ad.hookDna.includes('Urgency')
              }">
              🎯
            </div>
            <div class="p-3">
              <div class="flex items-center justify-between mb-2">
                <span class="text-xs font-body font-semibold text-gray-500">{{ ad.brand }}</span>
                <span class="text-[10px] text-gray-400 font-body">{{ ad.savedAt }}</span>
              </div>
              @if (ad.notes) {
                <p class="text-xs text-gray-600 font-body mb-2 m-0 leading-relaxed">{{ ad.notes }}</p>
              }
              <!-- DNA Badges -->
              <div class="flex flex-wrap gap-1 mb-3">
                @for (h of ad.hookDna; track h) {
                  <app-dna-badge [label]="h" type="hook" size="sm" />
                }
                @for (v of ad.visualDna; track v) {
                  <app-dna-badge [label]="v" type="visual" size="sm" />
                }
                @for (a of ad.audioDna; track a) {
                  <app-dna-badge [label]="a" type="audio" size="sm" />
                }
              </div>
              <button class="w-full px-3 py-1.5 bg-accent/10 text-accent rounded-lg text-xs font-body font-semibold hover:bg-accent/20 transition-colors">
                Create Brief from This →
              </button>
            </div>
          </div>
        }
      </div>
    </div>
  `
})
export default class SwipeFileComponent {
  savedAds: SwipeAd[] = [
    { id: 's-1', brand: 'WOW Skin Science', thumbnail: '', hookDna: ['Shock Statement'], visualDna: ['UGC Style'], audioDna: ['Hindi VO'], savedAt: 'Feb 10', notes: 'Great hook — opens with "Your moisturizer is lying to you"', height: 240 },
    { id: 's-2', brand: 'OZiva', thumbnail: '', hookDna: ['Transformation'], visualDna: ['Before/After'], audioDna: ['English VO'], savedAt: 'Feb 9', notes: '60-day transformation with real user', height: 180 },
    { id: 's-3', brand: 'Mamaearth', thumbnail: '', hookDna: ['Social Proof'], visualDna: ['Lifestyle'], audioDna: ['Hindi VO'], savedAt: 'Feb 8', notes: 'Celebrity endorsement + UGC mashup', height: 280 },
    { id: 's-4', brand: 'Sugar Cosmetics', thumbnail: '', hookDna: ['Personal Story'], visualDna: ['Macro Texture'], audioDna: ['Music-Only'], savedAt: 'Feb 7', notes: '', height: 200 },
    { id: 's-5', brand: 'Plum Goodness', thumbnail: '', hookDna: ['Authority'], visualDna: ['Product Focus'], audioDna: ['English VO'], savedAt: 'Feb 6', notes: 'Dermat-recommended angle with clinical data', height: 220 },
    { id: 's-6', brand: 'The Man Company', thumbnail: '', hookDna: ['Urgency'], visualDna: ['Dark Mood'], audioDna: ['Trending Audio'], savedAt: 'Feb 5', notes: 'Valentine\'s Day limited offer', height: 260 },
    { id: 's-7', brand: 'Nykaa', thumbnail: '', hookDna: ['Shock Statement'], visualDna: ['Split Screen'], audioDna: ['Hindi VO'], savedAt: 'Feb 4', notes: 'Side-by-side comparison that works', height: 190 },
    { id: 's-8', brand: 'mCaffeine', thumbnail: '', hookDna: ['Social Proof'], visualDna: ['UGC Style'], audioDna: ['Music-Only'], savedAt: 'Feb 3', notes: '', height: 240 },
    { id: 's-9', brand: 'Boat', thumbnail: '', hookDna: ['Urgency'], visualDna: ['Product Focus', 'Minimal'], audioDna: ['Upbeat'], savedAt: 'Feb 2', notes: 'Flash sale format — clean countdown timer', height: 170 },
    { id: 's-10', brand: 'Lenskart', thumbnail: '', hookDna: ['Personal Story'], visualDna: ['Lifestyle'], audioDna: ['Hindi VO'], savedAt: 'Feb 1', notes: 'Day-in-life format with product integration', height: 250 },
    { id: 's-11', brand: 'Bewakoof', thumbnail: '', hookDna: ['Transformation'], visualDna: ['UGC Style'], audioDna: ['Trending Audio'], savedAt: 'Jan 31', notes: '', height: 200 },
    { id: 's-12', brand: 'Kapiva', thumbnail: '', hookDna: ['Authority'], visualDna: ['Before/After'], audioDna: ['Hindi VO'], savedAt: 'Jan 30', notes: 'Ayurveda + science angle works well', height: 230 },
  ];
}
