import { Injectable, inject } from '@angular/core';
import { ApiService } from './api.service';
import { environment } from '../../../environments/environment';
import { Observable, map } from 'rxjs';

export interface AiChatResponse {
  content: string;
  chart?: { type: string; data: { label: string; value: number }[] };
  table?: { headers: string[]; rows: string[][] };
}

export interface ChatHistoryMessage {
  role: 'user' | 'ai';
  content: string;
}

export interface AiBriefingDecision {
  id: string;
  type: string;
  targetName: string;
  suggestedAction: string;
  urgency: string;
}

export interface AiBriefingResponse {
  briefing: {
    content: string;
    completedAt: string;
    runId: string;
  } | null;
  pendingDecisions: AiBriefingDecision[];
  suggestions: string[];
}

@Injectable({ providedIn: 'root' })
export class AiService {
  private api = inject(ApiService);

  chat(message: string, context?: { account_id?: string; credential_group?: string; date_preset?: string; currency?: string }, history?: ChatHistoryMessage[]): Observable<AiChatResponse> {
    return this.api.post<any>(environment.AI_CHAT, { message, ...context, history }).pipe(
      map(response => ({
        content: response.content || response.text || String(response),
        chart: response.chart,
        table: response.table,
      }))
    );
  }

  getBriefing(): Observable<AiBriefingResponse> {
    return this.api.get<AiBriefingResponse>(environment.AI_BRIEFING);
  }
}
