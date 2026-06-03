import { describe, it, expect } from 'vitest';
import { CREATIVE_PATTERNS, type VideoDNA } from '../services/creative-patterns.js';

describe('Creative Patterns Taxonomy', () => {
  it('should have 7 pattern categories', () => {
    const categories = Object.keys(CREATIVE_PATTERNS);
    expect(categories).toHaveLength(7);
    expect(categories).toEqual([
      'hook', 'visual_style', 'editing', 'audio',
      'text_overlay', 'color_mood', 'cta_style',
    ]);
  });

  it('should have 100+ total patterns', () => {
    const total = Object.values(CREATIVE_PATTERNS).reduce((sum, arr) => sum + arr.length, 0);
    expect(total).toBeGreaterThanOrEqual(100);
  });

  it('hook patterns should include core advertising hooks', () => {
    const hooks = CREATIVE_PATTERNS.hook;
    expect(hooks).toContain('Pattern Interrupt');
    expect(hooks).toContain('Curiosity Gap');
    expect(hooks).toContain('Social Proof Lead');
    expect(hooks).toContain('Urgency/Scarcity');
    expect(hooks).toContain('FOMO Setup');
  });

  it('visual styles should include UGC formats', () => {
    const styles = CREATIVE_PATTERNS.visual_style;
    expect(styles).toContain('UGC Handheld');
    expect(styles).toContain('Talking Head');
    expect(styles).toContain('Product Close-up');
  });

  it('each category should have at least 10 patterns', () => {
    for (const [category, patterns] of Object.entries(CREATIVE_PATTERNS)) {
      expect(patterns.length, `${category} should have 10+ patterns`).toBeGreaterThanOrEqual(10);
    }
  });

  it('should have no duplicate patterns within categories', () => {
    for (const [category, patterns] of Object.entries(CREATIVE_PATTERNS)) {
      const unique = new Set(patterns);
      expect(unique.size, `${category} has duplicates`).toBe(patterns.length);
    }
  });

  it('patterns should not be empty strings', () => {
    for (const [category, patterns] of Object.entries(CREATIVE_PATTERNS)) {
      for (const pattern of patterns) {
        expect(pattern.trim().length, `Empty pattern in ${category}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('VideoDNA Interface', () => {
  it('should accept a valid VideoDNA object', () => {
    const dna: VideoDNA = {
      hook_patterns: ['Pattern Interrupt'],
      visual_style: ['UGC Handheld'],
      editing_style: ['Fast Cuts (<2s)'],
      audio_style: ['Male Voiceover'],
      text_overlay_style: ['Bold Headline'],
      color_mood: ['Warm Tones'],
      cta_style: ['End Card'],
      hook_duration_seconds: 3,
      total_duration_seconds: 30,
      pacing: 'fast',
      cuts_per_second: 1.5,
      has_face: true,
      has_product_shot: true,
      has_text_overlay: true,
      has_voiceover: true,
      has_music: true,
      music_genre: 'pop',
      language: 'en',
      performance_insight: 'Strong hook with social proof',
      winning_elements: ['Pattern Interrupt hook', 'UGC style'],
      suggested_variations: ['Try slow reveal'],
    };

    expect(dna.hook_patterns).toHaveLength(1);
    expect(dna.pacing).toBe('fast');
    expect(dna.has_face).toBe(true);
  });
});
