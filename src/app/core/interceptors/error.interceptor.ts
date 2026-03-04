import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { ToastService } from '../services/toast.service';
import { AuthService } from '../services/auth.service';

/** Endpoints that handle their own errors silently (have fallback logic) */
const SILENT_ENDPOINTS = ['analytics/full', 'ad-accounts/kpis', 'dashboard/chart', 'dashboard/insights', 'brain/patterns', 'reports/list', 'ad-accounts/video-source', 'ad-accounts/top-ads'];

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const toast = inject(ToastService);
  const auth = inject(AuthService);

  return next(req).pipe(
    catchError(error => {
      // Skip toast for endpoints that have fallback handling
      const isSilent = SILENT_ENDPOINTS.some(ep => req.url.includes(ep));

      if (!isSilent) {
        switch (error.status) {
          case 401:
            if (!req.url.includes('auth/login') && !req.url.includes('auth/signup')) {
              toast.error('Session expired', 'Please log in again.');
              auth.logout();
            }
            break;
          case 403:
            toast.error('Access denied', "You don't have permission to do that.");
            break;
          case 404:
            // Don't toast for 404 on API calls — the component handles empty state
            break;
          case 429:
            toast.warning('Rate limited', "Too many requests. We'll retry automatically.");
            break;
          case 500:
          default:
            toast.error('Something went wrong', "We've been notified. Please try again.");
            break;
        }
      }
      return throwError(() => error);
    })
  );
};
