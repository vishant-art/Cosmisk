import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { ToastService } from '../services/toast.service';
import { AuthService } from '../services/auth.service';

/** Endpoints that handle their own errors silently (have fallback logic) */
const SILENT_ENDPOINTS = ['analytics/full', 'ad-accounts/kpis', 'dashboard/chart', 'dashboard/insights', 'brain/patterns', 'reports/list', 'ad-accounts/video-source', 'ad-accounts/top-ads'];

/** Prevent multiple 401 toasts/logouts firing simultaneously */
let logoutInProgress = false;

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const toast = inject(ToastService);
  const auth = inject(AuthService);

  return next(req).pipe(
    catchError(error => {
      const isSilent = SILENT_ENDPOINTS.some(ep => req.url.includes(ep));
      const isAuthRoute = req.url.includes('auth/login') || req.url.includes('auth/signup');

      // 401 = session expired — ALWAYS handle, even for silent endpoints
      if (error.status === 401 && !isAuthRoute) {
        if (!logoutInProgress) {
          logoutInProgress = true;
          toast.error('Session Expired', 'Please log in again.');
          auth.logout();
          // Reset after a brief delay to allow re-login
          setTimeout(() => { logoutInProgress = false; }, 3000);
        }
        return throwError(() => error);
      }

      // For non-401 errors, only toast on non-silent endpoints
      if (!isSilent) {
        switch (error.status) {
          case 403:
            toast.error('Access Denied', "You don't have permission to do that.");
            break;
          case 404:
            // Component handles empty state
            break;
          case 429: {
            const retryAfter = error.headers?.get('retry-after');
            const waitSec = retryAfter ? parseInt(retryAfter, 10) : 0;
            toast.warning('Rate Limited', waitSec > 0
              ? `Too many requests. Try again in ${waitSec} seconds.`
              : 'Too many requests. Please wait a moment.');
            break;
          }
          case 0:
            toast.error('Connection Lost', 'Could not reach the server. Check your internet connection.');
            break;
          case 500:
          default:
            toast.error('Something Went Wrong', "We've been notified. Please try again.");
            break;
        }
      }
      return throwError(() => error);
    })
  );
};
