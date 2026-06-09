import { Routes } from '@angular/router';

const routes: Routes = [
  { path: '', loadComponent: () => import('./onboarding.component') },
];

export default routes;
