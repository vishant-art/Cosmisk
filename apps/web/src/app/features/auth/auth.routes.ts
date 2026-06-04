import { Routes } from '@angular/router';

const routes: Routes = [
  { path: 'login', loadComponent: () => import('./login/login.component') },
  { path: 'signup', loadComponent: () => import('./signup/signup.component') },
  { path: 'forgot-password', loadComponent: () => import('./forgot-password/forgot-password.component') },
];

export default routes;
