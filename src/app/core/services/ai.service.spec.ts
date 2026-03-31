import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { AiService } from './ai.service';
import { ApiService } from './api.service';
import { environment } from '../../../environments/environment';

describe('AiService', () => {
  let service: AiService;
  let apiSpy: jasmine.SpyObj<ApiService>;

  beforeEach(() => {
    apiSpy = jasmine.createSpyObj('ApiService', ['get', 'post', 'put', 'delete']);

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        AiService,
        { provide: ApiService, useValue: apiSpy },
      ],
    });

    service = TestBed.inject(AiService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('chat()', () => {
    it('should POST message and return mapped response with content field', () => {
      apiSpy.post.and.returnValue(of({ content: 'Hello from AI', chart: null, table: null }));

      service.chat('What is my ROAS?').subscribe((res) => {
        expect(res.content).toBe('Hello from AI');
      });

      expect(apiSpy.post).toHaveBeenCalledWith(environment.AI_CHAT, { message: 'What is my ROAS?', history: undefined });
    });

    it('should map response.text to content if content is missing', () => {
      apiSpy.post.and.returnValue(of({ text: 'From text field' }));

      service.chat('test').subscribe((res) => {
        expect(res.content).toBe('From text field');
      });
    });

    it('should convert non-string response to string', () => {
      apiSpy.post.and.returnValue(of({ value: 42 }));

      service.chat('test').subscribe((res) => {
        expect(typeof res.content).toBe('string');
      });
    });

    it('should include context params when provided', () => {
      apiSpy.post.and.returnValue(of({ content: 'ok' }));
      const context = { account_id: 'act_123', credential_group: 'system', date_preset: 'last_7d', currency: 'INR' };

      service.chat('test', context).subscribe();

      expect(apiSpy.post).toHaveBeenCalledWith(environment.AI_CHAT, {
        message: 'test',
        account_id: 'act_123',
        credential_group: 'system',
        date_preset: 'last_7d',
        currency: 'INR',
        history: undefined,
      });
    });

    it('should include history when provided', () => {
      apiSpy.post.and.returnValue(of({ content: 'ok' }));
      const history = [{ role: 'user' as const, content: 'hi' }, { role: 'ai' as const, content: 'hello' }];

      service.chat('follow up', undefined, history).subscribe();

      expect(apiSpy.post).toHaveBeenCalledWith(environment.AI_CHAT, {
        message: 'follow up',
        history,
      });
    });

    it('should include chart and table in response when present', () => {
      const chart = { type: 'bar', data: [{ label: 'Jan', value: 100 }] };
      const table = { headers: ['Name'], rows: [['Test']] };
      apiSpy.post.and.returnValue(of({ content: 'Here is data', chart, table }));

      service.chat('show chart').subscribe((res) => {
        expect(res.chart).toEqual(chart);
        expect(res.table).toEqual(table);
      });
    });
  });

  describe('getBriefing()', () => {
    it('should GET briefing from API', () => {
      const mockBriefing = {
        briefing: { content: 'Morning report', completedAt: '2026-01-01', runId: 'r1' },
        pendingDecisions: [],
        suggestions: ['Increase budget on Campaign A'],
      };
      apiSpy.get.and.returnValue(of(mockBriefing));

      service.getBriefing().subscribe((res) => {
        expect(res.briefing!.content).toBe('Morning report');
        expect(res.suggestions.length).toBe(1);
      });

      expect(apiSpy.get).toHaveBeenCalledWith(environment.AI_BRIEFING);
    });

    it('should handle null briefing', () => {
      apiSpy.get.and.returnValue(of({ briefing: null, pendingDecisions: [], suggestions: [] }));

      service.getBriefing().subscribe((res) => {
        expect(res.briefing).toBeNull();
      });
    });
  });
});
