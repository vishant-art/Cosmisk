import { Routes } from '@angular/router';
import { PublicLayoutComponent } from './layouts/public-layout/public-layout.component';
import { AuthLayoutComponent } from './layouts/auth-layout/auth-layout.component';
import { OnboardingLayoutComponent } from './layouts/onboarding-layout/onboarding-layout.component';
import { AppLayoutComponent } from './layouts/app-layout/app-layout.component';
import { authGuard } from './core/guards/auth.guard';
import { onboardingGuard } from './core/guards/onboarding.guard';

export const routes: Routes = [
  // Public pages (no auth required)
  {
    path: '',
    component: PublicLayoutComponent,
    children: [
      { path: '', loadComponent: () => import('./features/landing/landing.component') },
      { path: 'pricing', loadComponent: () => import('./features/pricing/pricing.component') },
      { path: 'for-agencies', loadComponent: () => import('./features/for-agencies/for-agencies.component') },
      { path: 'contact', loadComponent: () => import('./features/contact/contact.component') },
      { path: 'blog', loadComponent: () => import('./features/blog/blog.component') },
      { path: 'pitch-deck', loadComponent: () => import('./features/pitch-deck/pitch-deck.component') },
      { path: 'score', loadComponent: () => import('./features/score/score.component') },
      { path: 'waitlist', loadComponent: () => import('./features/waitlist/waitlist.component') },
      { path: 'privacy-policy', loadComponent: () => import('./features/legal/privacy-policy.component') },
      { path: 'data-deletion', loadComponent: () => import('./features/legal/data-deletion.component') },
    ]
  },

  // Auth pages
  {
    path: '',
    component: AuthLayoutComponent,
    children: [
      { path: 'login', loadComponent: () => import('./features/auth/login/login.component') },
      { path: 'signup', loadComponent: () => import('./features/auth/signup/signup.component') },
    ]
  },

  // Forgot password (standalone layout, not split screen)
  {
    path: 'forgot-password',
    loadComponent: () => import('./features/auth/forgot-password/forgot-password.component'),
  },

  // Onboarding (auth required)
  {
    path: 'onboarding',
    component: OnboardingLayoutComponent,
    canActivate: [authGuard],
    loadChildren: () => import('./features/onboarding/onboarding.routes')
  },

  // Meta OAuth callback (auth required, but NOT onboarding guard)
  {
    path: 'app/settings/meta-callback',
    canActivate: [authGuard],
    loadComponent: () => import('./features/settings/meta-callback/meta-callback.component'),
  },

  // App (auth + onboarding required)
  {
    path: 'app',
    component: AppLayoutComponent,
    canActivate: [authGuard, onboardingGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard', loadComponent: () => import('./features/dashboard/dashboard.component') },
      { path: 'creative-cockpit', loadChildren: () => import('./features/creative-cockpit/creative-cockpit.routes') },
      { path: 'director-lab', loadComponent: () => import('./features/director-lab/director-lab.component') },
      { path: 'ugc-studio', loadComponent: () => import('./features/ugc-studio/ugc-studio.component') },
      { path: 'creative-engine', loadComponent: () => import('./features/creative-engine/creative-engine.component') },
      { path: 'creative-engine/:id', loadComponent: () => import('./features/creative-engine/sprint-detail/sprint-detail.component') },
      { path: 'ugc-studio/:id', loadComponent: () => import('./features/ugc-studio/project-detail/project-detail.component') },
      { path: 'brain', loadComponent: () => import('./features/brain/brain.component') },
      { path: 'analytics', loadComponent: () => import('./features/analytics/analytics.component') },
      { path: 'ai-studio', loadComponent: () => import('./features/ai-studio/ai-studio.component') },
      { path: 'reports', loadComponent: () => import('./features/reports/reports.component') },
      { path: 'campaigns', loadComponent: () => import('./features/campaigns/campaigns.component') },
      { path: 'graphic-studio', loadComponent: () => import('./features/graphic-studio/graphic-studio.component') },
      { path: 'assets', loadComponent: () => import('./features/assets/assets.component') },
      { path: 'swipe-file', loadComponent: () => import('./features/swipe-file/swipe-file.component') },
      { path: 'lighthouse', loadComponent: () => import('./features/lighthouse/lighthouse.component') },
      { path: 'attribution', loadComponent: () => import('./features/attribution/attribution.component') },
      { path: 'audit', loadComponent: () => import('./features/audit/audit.component') },
      { path: 'automations', loadComponent: () => import('./features/automations/automations.component') },
      { path: 'autopilot', loadComponent: () => import('./features/autopilot/autopilot.component') },
      { path: 'agent', loadComponent: () => import('./features/agent/agent-dashboard.component') },
      { path: 'content-bank', loadComponent: () => import('./features/content-bank/content-bank.component') },
      { path: 'competitor-spy', loadComponent: () => import('./features/competitor-spy/competitor-spy.component') },
      { path: 'settings', loadComponent: () => import('./features/settings/settings.component') },
      { path: 'settings/meta-callback', loadComponent: () => import('./features/settings/meta-callback/meta-callback.component') },
      { path: 'agency', loadComponent: () => import('./features/agency/agency-command-center.component') },
    ]
  },

  // 404
  { path: '**', loadComponent: () => import('./features/not-found/not-found.component') }
];
