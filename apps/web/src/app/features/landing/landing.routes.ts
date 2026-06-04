import { Routes } from '@angular/router';

const routes: Routes = [
  { path: '', loadComponent: () => import('./landing.component') },
];

export default routes;
