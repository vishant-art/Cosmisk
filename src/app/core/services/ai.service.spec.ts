import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { AiService } from './ai.service';
import { ApiService } from './api.service';
import { of } from 'rxjs';
import { environment } from '../../../environments/environment';

describe('AiService', () => {
  let service: AiService;
  let apiSpy: jasmine.SpyObj<ApiService>;

  beforeEach(() => {
    apiSpy = jasmine.createSpyObj('ApiService', ['get', 'post', 'put', 'delete']);

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        { provide: ApiService, useValue: apiSpy },
      ],
    });
    service = TestBed.inject(AiService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('chat', () => {
    it('should call api.post and map response with content field', () => {
      const apiRes = { content: 'Hello from AI', chart: null, table: null };
      apiSpy.post.and.returnValue(of(apiRes));

      service.chat('Hi').subscribe(res => {
        expect(res.content).toBe('Hello from AI');
      });
      expect(apiSpy.post).toHaveBeenCalledWith(environment.AI_CHAT, { message: 'Hi', history: undefined });
    });

    it('should map response with text field', () => {
      const apiRes = { text: 'Response via text' };
      apiSpy.post.and.returnValue(of(apiRes));

      service.chat('Hi').subscribe(res => {
        expect(res.content).toBe('Response via text');
      });
    });

    it('should stringify non-standard response', () => {
      apiSpy.post.and.returnValue(of('plain string'));

      service.chat('Hi').subscribe(res => {
        expect(res.content).toBe('plain string');
      });
    });

    it('should pass context and history', () => {
      const context = { account_id: 'a1', currency: 'USD' };
      const history = [{ role: 'user' as const, content: 'prev msg' }];
      apiSpy.post.and.returnValue(of({ content: 'reply' }));

      service.chat('Hello', context, history).subscribe();
      expect(apiSpy.post).toHaveBeenCalledWith(environment.AI_CHAT, {
        message: 'Hello',
        account_id: 'a1',
        currency: 'USD',
        history,
      });
    });

    it('should include chart and table in response', () => {
      const chart = { type: 'bar', data: [{ label: 'A', value: 10 }] };
      const table = { headers: ['H1'], rows: [['V1']] };
      apiSpy.post.and.returnValue(of({ content: 'Data', chart, table }));

      service.chat('Show data').subscribe(res => {
        expect(res.chart).toEqual(chart);
        expect(res.table).toEqual(table);
      });
    });
  });

  describe('getBriefing', () => {
    it('should call api.get', () => {
      const mockRes = {
        briefing: { content: 'Today...', completedAt: '2024-01-01', runId: 'r1' },
        pendingDecisions: [],
        suggestions: ['Do X'],
      };
      apiSpy.get.and.returnValue(of(mockRes));

      service.getBriefing().subscribe(res => {
        expect(res.briefing!.content).toBe('Today...');
        expect(res.suggestions.length).toBe(1);
      });
      expect(apiSpy.get).toHaveBeenCalledWith(environment.AI_BRIEFING);
    });
  });
});
