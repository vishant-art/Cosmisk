import { Routes } from '@angular/router';

const routes: Routes = [
  { path: '', loadComponent: () => import('./creative-cockpit.component') },
];

export default routes;
