import { Injectable, inject } from '@angular/core';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class FeedbackService {
  private api = inject(ApiService);
  rate(kind: 'chat' | 'creative', refId: string, rating: -1 | 0 | 1,
       extra?: { comment?: string; prompt_text?: string; response_text?: string }) {
    return this.api.post('feedback', { kind, ref_id: refId, rating, ...extra });
  }
}
