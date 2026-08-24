import { Routes } from '@angular/router';
import { AuthLayoutComponent } from '../layouts/auth-layout/auth-layout.component';
import { OnboardingLayoutComponent } from '../layouts/onboarding-layout/onboarding-layout.component';

/**
 * SLICE 1 PROTOTYPE ROUTES
 *
 * Deliberately NOT guarded. A reviewer can deep-link to any screen without
 * completing the journey before it. Production guards (authGuard /
 * onboardingGuard) are untouched and do not apply here.
 *
 * AuthLayoutComponent and OnboardingLayoutComponent are the REAL production
 * layouts, reused unmodified.
 */
const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },

  {
    path: '',
    component: AuthLayoutComponent,
    children: [
      { path: 'login', loadComponent: () => import('./screens/login.component') },
      { path: 'signup', loadComponent: () => import('./screens/signup.component') },
    ],
  },

  {
    path: '',
    component: OnboardingLayoutComponent,
    children: [
      { path: 'onboarding', loadComponent: () => import('./screens/onboarding.component') },
      { path: 'connect', loadComponent: () => import('./screens/connect.component') },
      { path: 'discovery', loadComponent: () => import('./screens/discovery.component') },
      { path: 'processing', loadComponent: () => import('./screens/processing.component') },
      { path: 'aha', loadComponent: () => import('./screens/aha.component') },
    ],
  },

  {
    path: '',
    loadComponent: () => import('./shell/proto-shell.component'),
    children: [
      { path: 'dashboard', loadComponent: () => import('./screens/dashboard.component') },
      { path: 'ask', loadComponent: () => import('./screens/ai.component') },
    ],
  },

  { path: '**', redirectTo: 'login' },
];

export default routes;
