const _BUILD_VER = '2026-02-13-v2';
import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ToastService } from '../../core/services/toast.service';
import { ModalComponent } from '../../shared/components/modal/modal.component';

interface Avatar {
  id: string;
  name: string;
  gender: 'Male' | 'Female';
  age: string;
  ethnicity: string;
  style: string;
  thumbnail: string;
  languages: string[];
}

interface UgcProject {
  id: string;
  name: string;
  avatarName: string;
  status: 'Draft' | 'Generating' | 'Ready' | 'Published';
  createdAt: string;
  duration: string;
  thumbnail: string;
}

const DEMO_AVATARS: Avatar[] = [
  { id: 'av-1', name: 'Priya', gender: 'Female', age: '25-30', ethnicity: 'Indian', style: 'Professional', thumbnail: '', languages: ['Hindi', 'English'] },
  { id: 'av-2', name: 'Rahul', gender: 'Male', age: '28-35', ethnicity: 'Indian', style: 'Casual', thumbnail: '', languages: ['Hindi', 'English', 'Marathi'] },
  { id: 'av-3', name: 'Ananya', gender: 'Female', age: '22-28', ethnicity: 'Indian', style: 'Trendy', thumbnail: '', languages: ['Hindi', 'English', 'Tamil'] },
  { id: 'av-4', name: 'Vikram', gender: 'Male', age: '30-40', ethnicity: 'Indian', style: 'Authority', thumbnail: '', languages: ['Hindi', 'English'] },
  { id: 'av-5', name: 'Meera', gender: 'Female', age: '35-45', ethnicity: 'Indian', style: 'Warm & Relatable', thumbnail: '', languages: ['Hindi', 'English', 'Bengali'] },
  { id: 'av-6', name: 'Arjun', gender: 'Male', age: '20-25', ethnicity: 'Indian', style: 'Gen-Z Energetic', thumbnail: '', languages: ['Hindi', 'English'] },
];

const DEMO_PROJECTS: UgcProject[] = [
  { id: 'ugc-1', name: 'Collagen Benefits Explainer', avatarName: 'Priya', status: 'Ready', createdAt: '2024-02-08', duration: '0:32', thumbnail: '' },
  { id: 'ugc-2', name: 'Summer Sale Announcement', avatarName: 'Rahul', status: 'Published', createdAt: '2024-02-06', duration: '0:18', thumbnail: '' },
  { id: 'ugc-3', name: 'Before/After Testimonial', avatarName: 'Ananya', status: 'Draft', createdAt: '2024-02-10', duration: '-', thumbnail: '' },
];

@Component({
  selector: 'app-ugc-studio',
  standalone: true,
  imports: [CommonModule, FormsModule, ModalComponent],
  template: `
    <div class="space-y-6">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-page-title font-display text-navy m-0">UGC Studio</h1>
          <p class="text-sm text-gray-500 font-body mt-1 mb-0">Create AI avatar videos for your campaigns</p>
        </div>
        <button
          (click)="startNewProject()"
          class="px-5 py-2.5 bg-accent text-white rounded-pill text-sm font-body font-semibold hover:bg-accent/90 transition-colors">
          + New UGC Video
        </button>
      </div>

      <!-- Wizard (when creating) -->
      @if (wizardOpen()) {
        <div class="bg-white rounded-card shadow-card overflow-hidden">
          <!-- Step indicator -->
          <div class="flex border-b border-gray-100">
            @for (s of steps; track s.num) {
              <div
                class="flex-1 px-4 py-3 flex items-center gap-2 text-sm font-body transition-colors"
                [ngClass]="{
                  'bg-accent/5 text-accent font-semibold border-b-2 border-accent': step() === s.num,
                  'text-gray-400': step() !== s.num && step() < s.num,
                  'text-green-600': step() > s.num
                }">
                @if (step() > s.num) {
                  <span class="w-5 h-5 bg-green-500 text-white rounded-full flex items-center justify-center text-xs">✓</span>
                } @else {
                  <span class="w-5 h-5 rounded-full flex items-center justify-center text-xs"
                    [ngClass]="step() === s.num ? 'bg-accent text-white' : 'bg-gray-200 text-gray-500'">{{ s.num }}</span>
                }
                {{ s.label }}
              </div>
            }
          </div>

          <!-- Step 1: Choose Avatar -->
          @if (step() === 1) {
            <div class="p-6">
              <h3 class="text-base font-display text-navy mb-1">Choose Your Avatar</h3>
              <p class="text-xs text-gray-500 font-body mb-4">Select an AI presenter for your video</p>

              <!-- Filters -->
              <div class="flex gap-3 mb-5">
                <select [(ngModel)]="genderFilter" class="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-body focus:ring-2 focus:ring-accent/30 focus:border-accent outline-none">
                  <option value="">All Genders</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
                <select [(ngModel)]="languageFilter" class="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-body focus:ring-2 focus:ring-accent/30 focus:border-accent outline-none">
                  <option value="">All Languages</option>
                  <option value="Hindi">Hindi</option>
                  <option value="English">English</option>
                  <option value="Tamil">Tamil</option>
                  <option value="Bengali">Bengali</option>
                  <option value="Marathi">Marathi</option>
                </select>
              </div>

              <!-- Avatar grid -->
              <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
                @for (avatar of filteredAvatars(); track avatar.id) {
                  <div
                    (click)="selectAvatar(avatar)"
                    class="border-2 rounded-xl p-4 cursor-pointer transition-all hover:shadow-md"
                    [ngClass]="selectedAvatar()?.id === avatar.id ? 'border-accent bg-accent/5' : 'border-gray-200 hover:border-gray-300'">
                    <div class="w-full aspect-square bg-gradient-to-br rounded-lg mb-3 flex items-center justify-center text-4xl"
                      [ngClass]="{
                        'from-pink-100 to-purple-100': avatar.gender === 'Female',
                        'from-blue-100 to-indigo-100': avatar.gender === 'Male'
                      }">
                      {{ avatar.gender === 'Female' ? '👩' : '👨' }}
                    </div>
                    <h4 class="text-sm font-body font-semibold text-navy m-0">{{ avatar.name }}</h4>
                    <p class="text-xs text-gray-500 font-body m-0 mt-0.5">{{ avatar.style }} · {{ avatar.age }}</p>
                    <div class="flex flex-wrap gap-1 mt-2">
                      @for (lang of avatar.languages; track lang) {
                        <span class="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded font-body">{{ lang }}</span>
                      }
                    </div>
                    @if (selectedAvatar()?.id === avatar.id) {
                      <div class="mt-2 text-xs text-accent font-body font-semibold flex items-center gap-1">
                        <span class="text-sm">✓</span> Selected
                      </div>
                    }
                  </div>
                }
              </div>

              <div class="flex justify-end mt-6">
                <button
                  [disabled]="!selectedAvatar()"
                  (click)="step.set(2)"
                  class="px-5 py-2 bg-accent text-white rounded-pill text-sm font-body font-semibold hover:bg-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                  Continue →
                </button>
              </div>
            </div>
          }

          <!-- Step 2: Write Script -->
          @if (step() === 2) {
            <div class="p-6">
              <h3 class="text-base font-display text-navy mb-1">Write Your Script</h3>
              <p class="text-xs text-gray-500 font-body mb-4">Write or generate a script for {{ selectedAvatar()?.name }} to deliver</p>

              <div class="grid md:grid-cols-3 gap-4 mb-4">
                <div class="md:col-span-2">
                  <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Video Name</label>
                  <input
                    [(ngModel)]="projectName"
                    placeholder="e.g., Collagen Benefits Explainer"
                    class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-body focus:ring-2 focus:ring-accent/30 focus:border-accent outline-none" />
                </div>
                <div>
                  <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Language</label>
                  <select [(ngModel)]="scriptLanguage" class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-body focus:ring-2 focus:ring-accent/30 focus:border-accent outline-none">
                    @for (lang of selectedAvatar()?.languages ?? []; track lang) {
                      <option [value]="lang">{{ lang }}</option>
                    }
                  </select>
                </div>
              </div>

              <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Script</label>
              <div class="relative">
                <textarea
                  [(ngModel)]="scriptText"
                  rows="8"
                  placeholder="Write your script here, or use AI to generate one..."
                  class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-body focus:ring-2 focus:ring-accent/30 focus:border-accent outline-none resize-none"></textarea>
                <div class="absolute bottom-3 right-3 text-xs text-gray-400 font-body">
                  {{ scriptText.length }} chars · ~{{ Math.ceil(scriptText.length / 15) }}s
                </div>
              </div>

              <button
                (click)="generateScript()"
                [disabled]="generatingScript()"
                class="mt-2 px-4 py-2 border border-accent text-accent rounded-pill text-xs font-body font-semibold hover:bg-accent/5 transition-colors disabled:opacity-40">
                @if (generatingScript()) {
                  <span class="inline-flex items-center gap-1.5">
                    <span class="w-3 h-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin"></span>
                    Generating...
                  </span>
                } @else {
                  ✨ AI Generate Script
                }
              </button>

              <!-- Tone & Style -->
              <div class="mt-4">
                <label class="text-xs font-body font-semibold text-gray-700 block mb-2">Tone</label>
                <div class="flex flex-wrap gap-2">
                  @for (tone of tones; track tone) {
                    <button
                      (click)="selectedTone = tone"
                      class="px-3 py-1 rounded-pill text-xs font-body transition-colors"
                      [ngClass]="selectedTone === tone ? 'bg-accent text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'">
                      {{ tone }}
                    </button>
                  }
                </div>
              </div>

              <div class="flex justify-between mt-6">
                <button (click)="step.set(1)" class="px-4 py-2 text-gray-500 text-sm font-body hover:text-gray-700">
                  ← Back
                </button>
                <button
                  [disabled]="!scriptText.trim() || !projectName.trim()"
                  (click)="step.set(3); startGeneration()"
                  class="px-5 py-2 bg-accent text-white rounded-pill text-sm font-body font-semibold hover:bg-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                  Generate Video →
                </button>
              </div>
            </div>
          }

          <!-- Step 3: Generate & Review -->
          @if (step() === 3) {
            <div class="p-6">
              <h3 class="text-base font-display text-navy mb-1">Generate & Review</h3>

              @if (generating()) {
                <div class="text-center py-16">
                  <div class="w-20 h-20 mx-auto mb-4 bg-accent/10 rounded-full flex items-center justify-center">
                    <span class="text-3xl animate-pulse">🎬</span>
                  </div>
                  <p class="text-sm font-body text-gray-600 mb-2">Generating your UGC video...</p>
                  <p class="text-xs text-gray-400 font-body mb-4">{{ selectedAvatar()?.name }} is rehearsing your script</p>
                  <div class="w-64 mx-auto bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div class="bg-accent h-full rounded-full transition-all duration-1000" [style.width.%]="genProgress()"></div>
                  </div>
                  <p class="text-xs text-gray-400 font-body mt-2">{{ genProgress() }}% complete</p>
                </div>
              } @else {
                <!-- Preview -->
                <div class="grid md:grid-cols-2 gap-6 mt-4">
                  <div>
                    <div class="aspect-[9/16] bg-gradient-to-br from-gray-100 to-gray-200 rounded-xl flex items-center justify-center relative overflow-hidden">
                      <div class="absolute inset-0 flex flex-col items-center justify-center">
                        <span class="text-6xl mb-2">{{ selectedAvatar()?.gender === 'Female' ? '👩' : '👨' }}</span>
                        <span class="text-sm font-body text-gray-500">{{ selectedAvatar()?.name }}</span>
                      </div>
                      <button class="absolute bottom-4 left-1/2 -translate-x-1/2 w-14 h-14 bg-accent text-white rounded-full flex items-center justify-center text-xl shadow-lg hover:bg-accent/90 transition-colors">
                        ▶
                      </button>
                      <span class="absolute top-3 right-3 px-2 py-0.5 bg-black/50 text-white text-xs rounded font-body">
                        0:{{ Math.ceil(scriptText.length / 15).toString().padStart(2, '0') }}
                      </span>
                    </div>
                  </div>
                  <div class="space-y-4">
                    <div>
                      <h4 class="text-sm font-body font-semibold text-navy m-0">{{ projectName }}</h4>
                      <p class="text-xs text-gray-500 font-body mt-1 mb-0">Avatar: {{ selectedAvatar()?.name }} · {{ scriptLanguage }} · {{ selectedTone }}</p>
                    </div>
                    <div>
                      <label class="text-xs font-body font-semibold text-gray-600 block mb-1">Script</label>
                      <div class="bg-gray-50 rounded-lg p-3 text-xs text-gray-700 font-body leading-relaxed max-h-40 overflow-y-auto">
                        {{ scriptText }}
                      </div>
                    </div>
                    <div>
                      <label class="text-xs font-body font-semibold text-gray-600 block mb-2">Format Variations</label>
                      <div class="space-y-2">
                        @for (fmt of formats; track fmt.label) {
                          <label class="flex items-center gap-2 p-2 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
                            <input type="checkbox" [(ngModel)]="fmt.checked" class="accent-accent" />
                            <span class="text-xs font-body">{{ fmt.label }}</span>
                            <span class="text-[10px] text-gray-400 font-body ml-auto">{{ fmt.ratio }}</span>
                          </label>
                        }
                      </div>
                    </div>
                    <div class="flex gap-3 pt-2">
                      <button (click)="regenerate()" class="px-4 py-2 border border-gray-300 text-gray-700 rounded-pill text-xs font-body font-semibold hover:bg-gray-50 transition-colors">
                        Regenerate
                      </button>
                      <button (click)="step.set(2)" class="px-4 py-2 border border-gray-300 text-gray-700 rounded-pill text-xs font-body font-semibold hover:bg-gray-50 transition-colors">
                        Edit Script
                      </button>
                      <button
                        (click)="publishVideo()"
                        class="px-5 py-2 bg-accent text-white rounded-pill text-xs font-body font-semibold hover:bg-accent/90 transition-colors flex-1">
                        Publish to Meta
                      </button>
                    </div>
                  </div>
                </div>
              }

              <div class="flex justify-between mt-6 border-t border-gray-100 pt-4">
                <button (click)="step.set(2)" class="px-4 py-2 text-gray-500 text-sm font-body hover:text-gray-700">
                  ← Back
                </button>
                <button (click)="saveAsDraft()" class="px-4 py-2 text-gray-500 text-sm font-body hover:text-gray-700">
                  Save as Draft
                </button>
              </div>
            </div>
          }
        </div>
      }

      <!-- Projects Dashboard -->
      @if (!wizardOpen()) {
        <div class="bg-white rounded-card shadow-card">
          <div class="p-4 border-b border-gray-100 flex items-center justify-between">
            <h3 class="text-sm font-display text-navy m-0">Your UGC Videos</h3>
            <span class="text-xs text-gray-400 font-body">{{ projects.length }} videos</span>
          </div>
          @if (projects.length === 0) {
            <div class="p-12 text-center">
              <span class="text-4xl block mb-3">📹</span>
              <p class="text-sm text-gray-500 font-body mb-3">No UGC videos yet</p>
              <button (click)="startNewProject()" class="px-4 py-2 bg-accent text-white rounded-pill text-xs font-body font-semibold">
                Create Your First Video
              </button>
            </div>
          } @else {
            <div class="divide-y divide-gray-50">
              @for (project of projects; track project.id) {
                <div class="p-4 flex items-center gap-4 hover:bg-gray-50 transition-colors">
                  <div class="w-16 h-16 bg-gradient-to-br from-gray-100 to-gray-200 rounded-lg flex items-center justify-center text-2xl shrink-0">
                    🎬
                  </div>
                  <div class="flex-1 min-w-0">
                    <h4 class="text-sm font-body font-semibold text-navy m-0">{{ project.name }}</h4>
                    <p class="text-xs text-gray-500 font-body m-0 mt-0.5">Avatar: {{ project.avatarName }} · {{ project.duration }}</p>
                  </div>
                  <span class="text-xs text-gray-400 font-body">{{ project.createdAt }}</span>
                  <span class="px-2 py-0.5 rounded-pill text-xs font-body font-medium"
                    [ngClass]="{
                      'bg-green-50 text-green-700': project.status === 'Ready' || project.status === 'Published',
                      'bg-yellow-50 text-yellow-700': project.status === 'Generating',
                      'bg-gray-100 text-gray-600': project.status === 'Draft'
                    }">
                    {{ project.status }}
                  </span>
                </div>
              }
            </div>
          }
        </div>
      }
    </div>
  `
})
export default class UgcStudioComponent {
  private toast = inject(ToastService);
  protected Math = Math;

  steps = [
    { num: 1, label: 'Choose Avatar' },
    { num: 2, label: 'Write Script' },
    { num: 3, label: 'Generate & Review' },
  ];

  wizardOpen = signal(false);
  step = signal(1);
  selectedAvatar = signal<Avatar | null>(null);
  generating = signal(false);
  genProgress = signal(0);
  generatingScript = signal(false);

  genderFilter = '';
  languageFilter = '';
  projectName = '';
  scriptText = '';
  scriptLanguage = 'Hindi';
  selectedTone = 'Conversational';

  tones = ['Conversational', 'Urgent', 'Aspirational', 'Educational', 'Playful', 'Premium'];
  formats = [
    { label: 'Reels / Stories (9:16)', ratio: '1080×1920', checked: true },
    { label: 'Feed Square (1:1)', ratio: '1080×1080', checked: true },
    { label: 'Feed Landscape (16:9)', ratio: '1920×1080', checked: false },
  ];

  projects: UgcProject[] = [...DEMO_PROJECTS];

  filteredAvatars = signal<Avatar[]>(DEMO_AVATARS);

  startNewProject() {
    this.wizardOpen.set(true);
    this.step.set(1);
    this.selectedAvatar.set(null);
    this.projectName = '';
    this.scriptText = '';
    this.updateFilteredAvatars();
  }

  selectAvatar(avatar: Avatar) {
    this.selectedAvatar.set(avatar);
    this.scriptLanguage = avatar.languages[0];
  }

  updateFilteredAvatars() {
    let filtered = DEMO_AVATARS;
    if (this.genderFilter) filtered = filtered.filter(a => a.gender === this.genderFilter);
    if (this.languageFilter) filtered = filtered.filter(a => a.languages.includes(this.languageFilter));
    this.filteredAvatars.set(filtered);
  }

  generateScript() {
    this.generatingScript.set(true);
    setTimeout(() => {
      this.scriptText = `Hey! 👋 Main hoon ${this.selectedAvatar()?.name}, aur aaj main aapko bataungi ek amazing secret.\n\nKya aap jaanti hain ki Marine Collagen se aapki skin mein farak sirf 14 din mein dikhta hai?\n\nHaan, sahi suna! Japanese Marine Collagen with Hyaluronic Acid — yeh hai wo formula jo celebrities use karti hain.\n\nAur sabse best baat? Abhi 40% OFF chal raha hai! Offer sirf limited time ke liye hai.\n\nLink bio mein hai — abhi order karein! 💛`;
      this.generatingScript.set(false);
    }, 2000);
  }

  startGeneration() {
    this.generating.set(true);
    this.genProgress.set(0);
    const interval = setInterval(() => {
      this.genProgress.update(v => {
        if (v >= 100) {
          clearInterval(interval);
          this.generating.set(false);
          return 100;
        }
        return v + Math.floor(Math.random() * 8) + 3;
      });
    }, 500);
  }

  regenerate() {
    this.startGeneration();
  }

  publishVideo() {
    this.toast.success('Video Published!', 'Your UGC video has been pushed to Meta Ads Manager');
    this.projects.unshift({
      id: 'ugc-' + Date.now(),
      name: this.projectName,
      avatarName: this.selectedAvatar()?.name ?? 'Unknown',
      status: 'Published',
      createdAt: new Date().toISOString().split('T')[0],
      duration: `0:${Math.ceil(this.scriptText.length / 15).toString().padStart(2, '0')}`,
      thumbnail: '',
    });
    this.wizardOpen.set(false);
  }

  saveAsDraft() {
    this.projects.unshift({
      id: 'ugc-' + Date.now(),
      name: this.projectName || 'Untitled Draft',
      avatarName: this.selectedAvatar()?.name ?? 'Unknown',
      status: 'Draft',
      createdAt: new Date().toISOString().split('T')[0],
      duration: '-',
      thumbnail: '',
    });
    this.toast.info('Draft Saved', 'You can continue editing later');
    this.wizardOpen.set(false);
  }
}
