import { TestBed, fakeAsync, tick, discardPeriodicTasks } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { MediaGenService } from './media-gen.service';
import { ApiService } from './api.service';
import { of } from 'rxjs';
import { environment } from '../../../environments/environment';

describe('MediaGenService', () => {
  let service: MediaGenService;
  let apiSpy: jasmine.SpyObj<ApiService>;

  beforeEach(() => {
    apiSpy = jasmine.createSpyObj('ApiService', ['get', 'post', 'put', 'delete']);

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        { provide: ApiService, useValue: apiSpy },
      ],
    });
    service = TestBed.inject(MediaGenService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('generateImage', () => {
    it('should call api.post with image params', () => {
      const params = { prompt: 'a cat', style: 'realistic', aspect_ratio: '16:9' };
      const mockRes = { success: true, image_url: 'https://example.com/image.png', generation_id: 'g1' };
      apiSpy.post.and.returnValue(of(mockRes));

      service.generateImage(params).subscribe(res => {
        expect(res.success).toBeTrue();
        expect(res.image_url).toBe('https://example.com/image.png');
      });
      expect(apiSpy.post).toHaveBeenCalledWith(environment.MEDIA_GENERATE_IMAGE, params);
    });

    it('should handle error response', () => {
      const params = { prompt: '' };
      const mockRes = { success: false, error: 'Invalid prompt' };
      apiSpy.post.and.returnValue(of(mockRes));

      service.generateImage(params).subscribe(res => {
        expect(res.success).toBeFalse();
        expect(res.error).toBe('Invalid prompt');
      });
    });
  });

  describe('generateVideo', () => {
    it('should call api.post with video params', () => {
      const params = { script: 'Hello world', duration: '30s', aspect_ratio: '9:16' };
      const mockRes = { success: true, status: 'processing' as const, generation_id: 'v1' };
      apiSpy.post.and.returnValue(of(mockRes));

      service.generateVideo(params).subscribe(res => {
        expect(res.success).toBeTrue();
        expect(res.status).toBe('processing');
      });
      expect(apiSpy.post).toHaveBeenCalledWith(environment.MEDIA_GENERATE_VIDEO, params);
    });
  });

  describe('pollVideoStatus', () => {
    it('should poll api.get and emit until completed', fakeAsync(() => {
      let callCount = 0;
      apiSpy.get.and.callFake((): any => {
        callCount++;
        if (callCount < 3) {
          return of({ success: true, status: 'processing' as const, progress: 50 });
        }
        return of({ success: true, status: 'completed' as const, video_url: 'https://example.com/video.mp4', progress: 100 });
      });

      const results: any[] = [];
      service.pollVideoStatus('v1').subscribe({
        next: res => results.push(res),
      });

      // First emission at t=0
      tick(0);
      expect(results.length).toBe(1);

      // Second emission at t=5000
      tick(5000);
      expect(results.length).toBe(2);

      // Third emission at t=10000 - completed, should complete the observable
      tick(5000);
      expect(results.length).toBe(3);
      expect(results[2].status).toBe('completed');

      discardPeriodicTasks();
    }));
  });
});
