/* ------------------------------------------------------------------ */
/*  Creative Pattern Taxonomy — 100+ patterns across 7 categories      */
/* ------------------------------------------------------------------ */

export const CREATIVE_PATTERNS = {
  hook: [
    'Pattern Interrupt', 'Curiosity Gap', 'Social Proof Lead', 'Controversy/Hot Take',
    'POV Format', 'Wait For It', 'Unboxing Reveal', 'Transformation Tease',
    'Question Hook', 'Stat/Number Hook', 'Celebrity/Authority Open', 'Shock Statement',
    'Price Anchor', 'Personal Story', 'Urgency/Scarcity', 'Education Lead',
    'Direct Interrogation', 'Myth Busting', 'Trend Jacking', 'FOMO Setup',
    'Challenge/Dare', 'Confession/Vulnerable', 'List Tease', 'Comparison Setup',
  ],
  visual_style: [
    'UGC Handheld', 'Studio Lit', 'Cinematic', 'Screen Recording', 'Green Screen',
    'Split Screen', 'Picture-in-Picture', 'Talking Head', 'Product Close-up',
    'Lifestyle B-roll', 'Flat Lay', 'Stop Motion', 'Text-Only', 'Meme Format',
    'Whiteboard/Diagram', 'Behind-the-Scenes', 'Street Interview', 'Reaction Format',
    'GRWM (Get Ready With Me)', 'POV Camera', 'Drone/Aerial', 'Macro/Detail',
  ],
  editing: [
    'Fast Cuts (<2s)', 'Slow Reveal', 'Jump Cuts', 'Smooth Transitions',
    'Whip Pan', 'Zoom Punch', 'Text Animations', 'Before/After Wipe',
    'Timelapse', 'Slow Motion', 'Match Cut', 'Montage Sequence',
    'Freeze Frame', 'Speed Ramp', 'Split/Merge', 'Countdown/Timer',
    'Swipe Transitions', 'Glitch Effect', 'Kinetic Typography',
  ],
  audio: [
    'Male Voiceover', 'Female Voiceover', 'Trending Audio/Sound', 'Lo-fi Background',
    'Upbeat Pop', 'Emotional Piano', 'ASMR', 'Sound Effects Driven',
    'No Music/Raw Audio', 'Dialogue-Driven', 'Podcast Style', 'Hip-hop/Trap Beat',
    'Corporate/Motivational', 'Cinematic Orchestra', 'Acoustic/Indie',
    'Nature/Ambient', 'Electronic/EDM', 'Voiceover + Music Bed',
  ],
  text_overlay: [
    'Bold Headline', 'Subtitle/Caption Style', 'Bullet Points', 'Counter/Numbers',
    'Auto-gen Captions', 'Price Callout', 'Testimonial Quote', 'Keyword Highlight',
    'Progress Bar', 'Minimal/No Text', 'Full-screen Text', 'Side Panel Text',
    'Animated Stats', 'Before/After Labels',
  ],
  color_mood: [
    'Warm Tones', 'Cool Tones', 'High Contrast', 'Desaturated/Muted',
    'Neon/Vibrant', 'Earth Tones', 'Monochrome', 'Pastel', 'Dark/Moody',
    'Bright/Airy', 'Golden Hour', 'Clinical/Clean White', 'Brand Colors Dominant',
  ],
  cta_style: [
    'End Card', 'Swipe Up Prompt', 'Link in Bio', 'Shop Now Overlay',
    'Urgency Timer/Countdown', 'Discount Code Reveal', 'Before/After Comparison CTA',
    'Soft CTA (No Hard Sell)', 'Multiple CTAs Throughout', 'Social Proof CTA',
    'Free Trial/Sample Offer', 'Limited Stock Warning',
  ],
} as const;

/* ------------------------------------------------------------------ */
/*  VideoDNA — Full video + audio + editing analysis per ad            */
/* ------------------------------------------------------------------ */

export interface VideoDNA {
  // Per-ad structured analysis (values from CREATIVE_PATTERNS)
  hook_patterns: string[];
  visual_style: string[];
  editing_style: string[];
  audio_style: string[];
  text_overlay_style: string[];
  color_mood: string[];
  cta_style: string[];

  // Timing analysis
  hook_duration_seconds: number;
  total_duration_seconds: number;
  pacing: 'fast' | 'medium' | 'slow';
  cuts_per_second: number;

  // Content analysis
  has_face: boolean;
  has_product_shot: boolean;
  has_text_overlay: boolean;
  has_voiceover: boolean;
  has_music: boolean;
  music_genre: string;
  language: string;

  // Strategic insight
  performance_insight: string;
  winning_elements: string[];
  suggested_variations: string[];
}
