import { Routes } from '@angular/router';

const routes: Routes = [
  { path: '', loadComponent: () => import('./ad-command.component') },
];

export default routes;
