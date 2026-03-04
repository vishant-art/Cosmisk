import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { AnimateOnScrollDirective } from '../../shared/directives/animate-on-scroll.directive';

@Component({
  selector: 'app-blog',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, LucideAngularModule, AnimateOnScrollDirective],
  template: `
    <!-- Hero -->
    <section class="relative overflow-hidden bg-dark-mesh py-24 -mt-[72px] pt-[calc(6rem+72px)]">
      <div class="relative z-10 max-w-7xl mx-auto px-6 text-center">
        <h1 class="text-hero font-display text-white mb-4">The Cosmisk Blog</h1>
        <p class="text-lg text-gray-400 font-body max-w-xl mx-auto">
          Insights on creative strategy, performance marketing, and AI-powered advertising.
        </p>
      </div>
    </section>

    <!-- Category Filters -->
    <section class="py-8 bg-white border-b border-divider sticky top-[72px] z-30">
      <div class="max-w-5xl mx-auto px-6">
        <div class="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Blog categories">
          @for (cat of categories; track cat; let i = $index) {
            <button
              (click)="activeCategory.set(i)"
              role="tab"
              [attr.aria-selected]="activeCategory() === i"
              class="px-4 py-2 rounded-pill text-sm font-body font-medium whitespace-nowrap border-0 cursor-pointer transition-all duration-300"
              [ngClass]="activeCategory() === i ? 'bg-accent text-white' : 'bg-[#F7F8FA] text-gray-600 hover:bg-gray-100'">
              {{ cat }}
            </button>
          }
        </div>
      </div>
    </section>

    <!-- Featured Post -->
    <section class="py-12 bg-[#F7F8FA]">
      <div appAnimateOnScroll class="max-w-5xl mx-auto px-6">
        <div class="bg-white rounded-2xl shadow-card border border-divider overflow-hidden grid md:grid-cols-2">
          <div class="aspect-[16/10] md:aspect-auto bg-gradient-to-br from-accent/10 via-violet-50 to-blue-50 flex items-center justify-center p-8">
            <div class="text-center">
              <lucide-icon name="sparkles" [size]="48" class="text-accent/40 mb-3 mx-auto"></lucide-icon>
              <p class="text-sm text-accent/60 font-body m-0">Featured Article</p>
            </div>
          </div>
          <div class="p-8 flex flex-col justify-center">
            <div class="flex items-center gap-2 mb-3">
              <span class="px-2.5 py-0.5 bg-accent/10 text-accent text-xs font-bold rounded-pill">FEATURED</span>
              <span class="text-xs text-gray-400 font-body">{{ featuredPost.date }}</span>
            </div>
            <h2 class="text-section-title font-display text-navy mb-3">{{ featuredPost.title }}</h2>
            <p class="text-sm text-gray-600 font-body leading-relaxed mb-4">{{ featuredPost.excerpt }}</p>
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 rounded-full bg-gradient-to-br from-accent to-violet-500 flex items-center justify-center text-white text-xs font-bold">{{ featuredPost.authorInitials }}</div>
              <div>
                <p class="text-sm font-body font-semibold text-navy m-0">{{ featuredPost.author }}</p>
                <p class="text-xs text-gray-500 m-0">{{ featuredPost.readTime }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Article Grid -->
    <section class="py-12 bg-[#F7F8FA]">
      <div class="max-w-5xl mx-auto px-6">
        <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          @for (post of filteredPosts(); track post.title; let i = $index) {
            <article appAnimateOnScroll [aosDelay]="i * 80" class="bg-white rounded-2xl shadow-card border border-divider overflow-hidden hover:shadow-card-hover hover:-translate-y-1 transition-all duration-300 cursor-pointer">
              <div class="aspect-[16/10] flex items-center justify-center p-6" [ngClass]="post.bgClass">
                <lucide-icon [name]="post.icon" [size]="36" class="text-white/60"></lucide-icon>
              </div>
              <div class="p-5">
                <div class="flex items-center gap-2 mb-2">
                  <span class="px-2 py-0.5 text-[10px] font-bold rounded-pill" [ngClass]="post.tagClass">{{ post.category }}</span>
                  <span class="text-xs text-gray-400 font-body">{{ post.date }}</span>
                </div>
                <h3 class="text-sm font-display font-semibold text-navy mb-2 leading-snug">{{ post.title }}</h3>
                <p class="text-xs text-gray-500 font-body leading-relaxed m-0 mb-3">{{ post.excerpt }}</p>
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <div class="w-6 h-6 rounded-full flex items-center justify-center text-white text-[8px] font-bold" [style.background]="post.authorColor">{{ post.authorInitials }}</div>
                    <span class="text-xs text-gray-500 font-body">{{ post.author }}</span>
                  </div>
                  <span class="text-xs text-gray-400 font-body">{{ post.readTime }}</span>
                </div>
              </div>
            </article>
          }
        </div>

        <!-- Coming Soon Notice -->
        <div appAnimateOnScroll class="text-center mt-12 py-8">
          <div class="inline-flex items-center gap-2 px-5 py-2.5 bg-white rounded-pill shadow-card border border-divider">
            <lucide-icon name="pen-line" [size]="16" class="text-accent"></lucide-icon>
            <span class="text-sm font-body text-gray-600">More articles coming soon. <span class="font-semibold text-navy">Stay tuned!</span></span>
          </div>
        </div>
      </div>
    </section>

    <!-- Newsletter CTA -->
    <section class="py-16 bg-white">
      <div appAnimateOnScroll class="max-w-2xl mx-auto px-6 text-center">
        <h2 class="text-section-title font-display text-navy mb-3">Get Creative Intelligence Weekly</h2>
        <p class="text-sm text-gray-600 font-body mb-6">Join 2,000+ marketers getting our best insights on creative strategy and AI advertising.</p>
        @if (!newsletterSubmitted()) {
          <form (submit)="submitNewsletter(); $event.preventDefault()" class="flex gap-2 max-w-md mx-auto">
            <label for="newsletter-email" class="sr-only">Email for newsletter</label>
            <input
              id="newsletter-email"
              type="email"
              [(ngModel)]="newsletterEmail"
              name="newsletterEmail"
              placeholder="Your email address"
              required
              class="input flex-1" />
            <button type="submit" class="btn-primary !px-5 whitespace-nowrap hover:shadow-glow transition-all duration-300">Subscribe</button>
          </form>
        } @else {
          <div class="inline-flex items-center gap-2 px-5 py-2.5 bg-green-50 rounded-pill border border-green-200" role="status">
            <lucide-icon name="check-circle" [size]="16" class="text-green-500"></lucide-icon>
            <span class="text-sm font-body text-green-700">You're subscribed! Check your inbox.</span>
          </div>
        }
      </div>
    </section>
  `
})
export default class BlogComponent {
  activeCategory = signal(0);
  newsletterEmail = '';
  newsletterSubmitted = signal(false);

  categories = ['All', 'Creative Strategy', 'AI & Automation', 'Performance Marketing', 'Case Studies', 'Product Updates'];

  featuredPost = {
    title: 'The Creative DNA Framework: Why Your Best Ads Work (And How to Replicate Them)',
    excerpt: 'We analyzed 10,000+ Meta ads across 200 D2C brands to discover the three DNA strands that predict creative performance. Here\'s what we found.',
    date: 'Feb 20, 2026',
    author: 'Vishant Jain',
    authorInitials: 'VJ',
    readTime: '8 min read',
    category: 'Creative Strategy',
  };

  posts = [
    {
      title: 'Hook DNA: The 7 Opening Patterns That Stop the Scroll',
      excerpt: 'From shock statements to price anchors, these hook types consistently outperform across industries.',
      date: 'Feb 18, 2026', category: 'Creative Strategy', readTime: '6 min read',
      author: 'Vishant Jain', authorInitials: 'VJ', authorColor: '#6366F1',
      icon: 'zap', bgClass: 'bg-gradient-to-br from-amber-400 to-orange-500', tagClass: 'bg-amber-100 text-amber-700',
    },
    {
      title: 'How AI Is Replacing the 3-Week UGC Production Cycle',
      excerpt: 'AI avatars and DNA-powered scripts are cutting UGC turnaround from weeks to minutes.',
      date: 'Feb 15, 2026', category: 'AI & Automation', readTime: '5 min read',
      author: 'Priya Sharma', authorInitials: 'PS', authorColor: '#EC4899',
      icon: 'video', bgClass: 'bg-gradient-to-br from-violet-400 to-purple-600', tagClass: 'bg-violet-100 text-violet-700',
    },
    {
      title: 'ROAS Dropped 20%? Here\'s Exactly How to Diagnose It',
      excerpt: 'A step-by-step guide to using Creative DNA analysis to find the root cause of performance drops.',
      date: 'Feb 12, 2026', category: 'Performance Marketing', readTime: '7 min read',
      author: 'Amit Patel', authorInitials: 'AP', authorColor: '#10B981',
      icon: 'trending-down', bgClass: 'bg-gradient-to-br from-red-400 to-rose-600', tagClass: 'bg-red-100 text-red-700',
    },
    {
      title: 'Case Study: How Nectar 4.8x\'d Their ROAS in 90 Days',
      excerpt: 'From guessing to data-driven creative decisions. A detailed breakdown of Nectar\'s transformation.',
      date: 'Feb 8, 2026', category: 'Case Studies', readTime: '10 min read',
      author: 'Vishant Jain', authorInitials: 'VJ', authorColor: '#6366F1',
      icon: 'crown', bgClass: 'bg-gradient-to-br from-emerald-400 to-teal-600', tagClass: 'bg-green-100 text-green-700',
    },
    {
      title: 'Cross-Brand Intelligence: The Agency Superpower Nobody Talks About',
      excerpt: 'When winning patterns from your skincare brand boost your supplements brand, that\'s the Brain at work.',
      date: 'Feb 5, 2026', category: 'Creative Strategy', readTime: '6 min read',
      author: 'Karan Mehta', authorInitials: 'KM', authorColor: '#3B82F6',
      icon: 'brain', bgClass: 'bg-gradient-to-br from-blue-400 to-indigo-600', tagClass: 'bg-blue-100 text-blue-700',
    },
    {
      title: 'Introducing Cosmisk v2: DNA Scanner, Director Lab, and More',
      excerpt: 'A deep dive into our biggest product update ever. New DNA analysis, brief generation, and UGC capabilities.',
      date: 'Feb 1, 2026', category: 'Product Updates', readTime: '4 min read',
      author: 'Vishant Jain', authorInitials: 'VJ', authorColor: '#6366F1',
      icon: 'sparkles', bgClass: 'bg-gradient-to-br from-accent to-violet-600', tagClass: 'bg-accent/10 text-accent',
    },
  ];

  filteredPosts() {
    const cat = this.categories[this.activeCategory()];
    if (cat === 'All') return this.posts;
    return this.posts.filter(p => p.category === cat);
  }

  submitNewsletter() {
    if (this.newsletterEmail.includes('@')) {
      this.newsletterSubmitted.set(true);
    }
  }
}
