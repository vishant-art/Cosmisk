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

  // Onboarding (auth required)
  {
    path: 'onboarding',
    component: OnboardingLayoutComponent,
    canActivate: [authGuard],
    loadChildren: () => import('./features/onboarding/onboarding.routes')
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
      { path: 'settings', loadComponent: () => import('./features/settings/settings.component') },
    ]
  },

  // Wildcard
  { path: '**', redirectTo: '' }
];
