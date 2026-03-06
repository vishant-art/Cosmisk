import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';

interface ScoreAnalysis {
  score: number;
  grade: string;
  summary: string;
  dna: {
    hook: { types: string[]; score: number; analysis: string };
    visual: { styles: string[]; score: number; analysis: string };
    audio: { styles: string[]; score: number; analysis: string };
  };
  strengths: string[];
  improvements: {
    priority: number;
    area: string;
    current: string;
    suggested: string;
    expected_impact: string;
  }[];
  competitor_context: string;
  remake_suggestions: string[];
}

@Component({
  selector: 'app-score',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="min-h-screen bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 text-white">
      <!-- Header -->
      <nav class="max-w-5xl mx-auto px-6 py-6 flex items-center justify-between">
        <a routerLink="/" class="text-xl font-display font-bold tracking-tight">
          <span class="text-white">Cosmisk</span>
          <span class="text-accent ml-1">Score</span>
        </a>
        <a routerLink="/signup" class="text-sm text-gray-400 hover:text-white transition">
          Get full access →
        </a>
      </nav>

      <div class="max-w-3xl mx-auto px-6 pt-12 pb-24">
        <!-- Hero -->
        <div class="text-center mb-12">
          <h1 class="text-4xl md:text-5xl font-display font-bold mb-4 leading-tight">
            How good is your ad creative?
          </h1>
          <p class="text-lg text-gray-400 max-w-xl mx-auto">
            Get an instant AI-powered analysis of your ad's hook, visuals, and audio.
            See what's working, what's not, and how to improve it.
          </p>
        </div>

        <!-- Input Form -->
        @if (!analysis()) {
          <div class="bg-gray-800/50 border border-gray-700/50 rounded-2xl p-8 backdrop-blur-sm">
            <div class="space-y-5">
              <!-- URL or Description -->
              <div>
                <label class="text-sm font-medium text-gray-300 block mb-2">Ad Creative URL or Description</label>
                <textarea
                  [(ngModel)]="adInput"
                  rows="3"
                  placeholder="Paste a URL to your ad creative, or describe it in detail (visuals, copy, hook, style...)"
                  class="w-full px-4 py-3 bg-gray-900/80 border border-gray-700 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent resize-none">
                </textarea>
              </div>

              <!-- Options row -->
              <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label class="text-xs text-gray-400 block mb-1">Format</label>
                  <select [(ngModel)]="adFormat" class="w-full px-3 py-2 bg-gray-900/80 border border-gray-700 rounded-lg text-sm text-white">
                    <option value="">Auto-detect</option>
                    <option value="image">Static Image</option>
                    <option value="video">Video</option>
                    <option value="carousel">Carousel</option>
                    <option value="story">Story / Reel</option>
                  </select>
                </div>
                <div>
                  <label class="text-xs text-gray-400 block mb-1">Industry</label>
                  <input [(ngModel)]="adIndustry" placeholder="e.g. DTC skincare, SaaS"
                    class="w-full px-3 py-2 bg-gray-900/80 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500" />
                </div>
                <div>
                  <label class="text-xs text-gray-400 block mb-1">Platform</label>
                  <select [(ngModel)]="adPlatform" class="w-full px-3 py-2 bg-gray-900/80 border border-gray-700 rounded-lg text-sm text-white">
                    <option value="meta">Meta (Facebook/Instagram)</option>
                    <option value="google">Google Ads</option>
                    <option value="tiktok">TikTok</option>
                  </select>
                </div>
              </div>

              <button
                (click)="analyzeAd()"
                [disabled]="analyzing() || !adInput.trim()"
                class="w-full py-3 bg-accent text-white rounded-xl font-semibold text-sm hover:bg-accent/90 transition disabled:opacity-50 flex items-center justify-center gap-2">
                @if (analyzing()) {
                  <div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  Analyzing...
                } @else {
                  Get Your Score
                }
              </button>
            </div>

            @if (error()) {
              <div class="mt-4 p-3 bg-red-900/30 border border-red-800/50 rounded-lg text-sm text-red-300">
                {{ error() }}
              </div>
            }
          </div>
        }

        <!-- Results -->
        @if (analysis()) {
          <div class="space-y-6">
            <!-- Score Header -->
            <div class="bg-gray-800/50 border border-gray-700/50 rounded-2xl p-8 backdrop-blur-sm text-center">
              <div class="inline-flex items-center justify-center w-28 h-28 rounded-full border-4 mb-4"
                [class]="getScoreBorderClass(analysis()!.score)">
                <div>
                  <p class="text-4xl font-bold">{{ analysis()!.score }}</p>
                  <p class="text-sm font-medium" [class]="getScoreTextClass(analysis()!.score)">{{ analysis()!.grade }}</p>
                </div>
              </div>
              <p class="text-lg text-gray-300 max-w-lg mx-auto">{{ analysis()!.summary }}</p>
            </div>

            <!-- DNA Breakdown -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <!-- Hook -->
              <div class="bg-gray-800/50 border border-gray-700/50 rounded-xl p-5">
                <div class="flex items-center justify-between mb-3">
                  <h3 class="text-sm font-semibold text-violet-400 uppercase tracking-wider">Hook</h3>
                  <span class="text-lg font-bold" [class]="getScoreTextClass(analysis()!.dna.hook.score)">
                    {{ analysis()!.dna.hook.score }}
                  </span>
                </div>
                <div class="flex flex-wrap gap-1 mb-3">
                  @for (tag of analysis()!.dna.hook.types; track tag) {
                    <span class="px-2 py-0.5 bg-violet-500/20 text-violet-300 rounded text-xs">{{ tag }}</span>
                  }
                </div>
                <p class="text-xs text-gray-400 leading-relaxed">{{ analysis()!.dna.hook.analysis }}</p>
              </div>

              <!-- Visual -->
              <div class="bg-gray-800/50 border border-gray-700/50 rounded-xl p-5">
                <div class="flex items-center justify-between mb-3">
                  <h3 class="text-sm font-semibold text-blue-400 uppercase tracking-wider">Visual</h3>
                  <span class="text-lg font-bold" [class]="getScoreTextClass(analysis()!.dna.visual.score)">
                    {{ analysis()!.dna.visual.score }}
                  </span>
                </div>
                <div class="flex flex-wrap gap-1 mb-3">
                  @for (tag of analysis()!.dna.visual.styles; track tag) {
                    <span class="px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded text-xs">{{ tag }}</span>
                  }
                </div>
                <p class="text-xs text-gray-400 leading-relaxed">{{ analysis()!.dna.visual.analysis }}</p>
              </div>

              <!-- Audio -->
              <div class="bg-gray-800/50 border border-gray-700/50 rounded-xl p-5">
                <div class="flex items-center justify-between mb-3">
                  <h3 class="text-sm font-semibold text-cyan-400 uppercase tracking-wider">Audio</h3>
                  <span class="text-lg font-bold" [class]="getScoreTextClass(analysis()!.dna.audio.score)">
                    {{ analysis()!.dna.audio.score }}
                  </span>
                </div>
                <div class="flex flex-wrap gap-1 mb-3">
                  @for (tag of analysis()!.dna.audio.styles; track tag) {
                    <span class="px-2 py-0.5 bg-cyan-500/20 text-cyan-300 rounded text-xs">{{ tag }}</span>
                  }
                </div>
                <p class="text-xs text-gray-400 leading-relaxed">{{ analysis()!.dna.audio.analysis }}</p>
              </div>
            </div>

            <!-- Strengths -->
            @if (analysis()!.strengths.length > 0) {
              <div class="bg-gray-800/50 border border-gray-700/50 rounded-xl p-6">
                <h3 class="text-sm font-semibold text-green-400 uppercase tracking-wider mb-3">Strengths</h3>
                <ul class="space-y-2">
                  @for (s of analysis()!.strengths; track s) {
                    <li class="flex items-start gap-2 text-sm text-gray-300">
                      <span class="text-green-400 mt-0.5">+</span>
                      {{ s }}
                    </li>
                  }
                </ul>
              </div>
            }

            <!-- Improvements -->
            @if (analysis()!.improvements.length > 0) {
              <div class="bg-gray-800/50 border border-gray-700/50 rounded-xl p-6">
                <h3 class="text-sm font-semibold text-amber-400 uppercase tracking-wider mb-4">How to Improve</h3>
                <div class="space-y-4">
                  @for (imp of analysis()!.improvements; track imp.priority) {
                    <div class="border-l-2 pl-4" [class]="imp.priority === 1 ? 'border-amber-400' : imp.priority === 2 ? 'border-amber-600' : 'border-gray-600'">
                      <div class="flex items-center gap-2 mb-1">
                        <span class="px-1.5 py-0.5 bg-gray-700 rounded text-[10px] text-gray-300 uppercase">{{ imp.area }}</span>
                        <span class="text-xs text-amber-400">Priority {{ imp.priority }}</span>
                      </div>
                      <p class="text-sm text-gray-400 mb-1"><span class="text-gray-500">Now:</span> {{ imp.current }}</p>
                      <p class="text-sm text-white mb-1"><span class="text-gray-500">Do:</span> {{ imp.suggested }}</p>
                      <p class="text-xs text-green-400">Expected: {{ imp.expected_impact }}</p>
                    </div>
                  }
                </div>
              </div>
            }

            <!-- Remake Suggestions -->
            @if (analysis()!.remake_suggestions.length > 0) {
              <div class="bg-gray-800/50 border border-gray-700/50 rounded-xl p-6">
                <h3 class="text-sm font-semibold text-accent uppercase tracking-wider mb-3">Variation Ideas</h3>
                <ul class="space-y-2">
                  @for (s of analysis()!.remake_suggestions; track s) {
                    <li class="text-sm text-gray-300">{{ s }}</li>
                  }
                </ul>
              </div>
            }

            <!-- Share Your Score -->
            <div class="bg-gray-800/50 border border-gray-700/50 rounded-xl p-6 text-center">
              <h3 class="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-4">Share Your Score</h3>
              <div class="flex items-center justify-center gap-3 flex-wrap">
                <button (click)="shareOnTwitter()" class="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition flex items-center gap-2">
                  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                  Post on X
                </button>
                <button (click)="shareOnLinkedIn()" class="px-4 py-2 bg-[#0A66C2] hover:bg-[#004182] text-white text-sm rounded-lg transition flex items-center gap-2">
                  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                  Share on LinkedIn
                </button>
                <button (click)="copyShareLink()" class="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition flex items-center gap-2">
                  @if (copied()) {
                    <svg class="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                    Copied!
                  } @else {
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"/></svg>
                    Copy Link
                  }
                </button>
              </div>
            </div>

            <!-- CTA -->
            <div class="bg-gradient-to-r from-accent/20 to-violet-500/20 border border-accent/30 rounded-2xl p-8 text-center">
              <h3 class="text-xl font-bold mb-2">Want to generate better creatives automatically?</h3>
              <p class="text-sm text-gray-400 mb-6">Cosmisk analyzes your ad account, generates 100+ data-backed creatives, and publishes them — all in one sprint.</p>
              <a routerLink="/signup" class="inline-block px-8 py-3 bg-accent text-white rounded-xl font-semibold text-sm hover:bg-accent/90 transition">
                Start Free
              </a>
            </div>

            <!-- Analyze Another -->
            <div class="text-center">
              <button (click)="reset()" class="text-sm text-gray-400 hover:text-white transition underline">
                Analyze another creative
              </button>
            </div>
          </div>
        }

        <!-- Footer -->
        <div class="text-center mt-16 pt-8 border-t border-gray-800">
          <p class="text-xs text-gray-500">
            Powered by Cosmisk AI. Scores are predictive estimates based on ad performance patterns.
          </p>
        </div>
      </div>
    </div>
  `,
})
export default class ScoreComponent {
  private http = inject(HttpClient);

  adInput = '';
  adFormat = '';
  adIndustry = '';
  adPlatform = 'meta';

  analyzing = signal(false);
  analysis = signal<ScoreAnalysis | null>(null);
  error = signal<string | null>(null);
  copied = signal(false);

  analyzeAd() {
    const input = this.adInput.trim();
    if (!input) return;

    this.analyzing.set(true);
    this.error.set(null);

    const isUrl = input.startsWith('http://') || input.startsWith('https://');
    const baseUrl = environment.production ? environment.N8N_BASE_URL : '/api';

    this.http.post<any>(`${baseUrl}/${environment.SCORE_ANALYZE}`, {
      url: isUrl ? input : undefined,
      description: !isUrl ? input : undefined,
      format: this.adFormat || undefined,
      industry: this.adIndustry || undefined,
      platform: this.adPlatform,
    }).subscribe({
      next: (res) => {
        this.analyzing.set(false);
        if (res.success && res.analysis) {
          this.analysis.set(res.analysis);
        } else {
          this.error.set(res.error || 'Analysis failed');
        }
      },
      error: (err) => {
        this.analyzing.set(false);
        this.error.set(err.error?.error || 'Something went wrong. Try again.');
      },
    });
  }

  reset() {
    this.analysis.set(null);
    this.error.set(null);
    this.adInput = '';
    this.adFormat = '';
    this.adIndustry = '';
  }

  getScoreBorderClass(score: number): string {
    if (score >= 70) return 'border-green-400';
    if (score >= 50) return 'border-amber-400';
    return 'border-red-400';
  }

  getScoreTextClass(score: number): string {
    if (score >= 70) return 'text-green-400';
    if (score >= 50) return 'text-amber-400';
    return 'text-red-400';
  }

  shareOnTwitter() {
    const a = this.analysis();
    if (!a) return;
    const text = `My ad creative scored ${a.score}/100 (${a.grade}) on Cosmisk Score.\n\nHook: ${a.dna.hook.score} | Visual: ${a.dna.visual.score} | Audio: ${a.dna.audio.score}\n\nGet your free score:`;
    const url = 'https://cosmisk.com/score';
    window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank');
  }

  shareOnLinkedIn() {
    const url = 'https://cosmisk.com/score';
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`, '_blank');
  }

  copyShareLink() {
    const a = this.analysis();
    const text = a
      ? `I scored ${a.score}/100 on Cosmisk Score (Hook: ${a.dna.hook.score}, Visual: ${a.dna.visual.score}, Audio: ${a.dna.audio.score}). Try it free: https://cosmisk.com/score`
      : 'https://cosmisk.com/score';
    navigator.clipboard.writeText(text).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    });
  }
}
