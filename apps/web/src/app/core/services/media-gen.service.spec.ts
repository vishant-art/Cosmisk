import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { MediaGenService } from './media-gen.service';
import { ApiService } from './api.service';
import { environment } from '../../../environments/environment';

describe('MediaGenService', () => {
  let service: MediaGenService;
  let apiSpy: jasmine.SpyObj<ApiService>;

  beforeEach(() => {
    apiSpy = jasmine.createSpyObj('ApiService', ['get', 'post', 'put', 'delete']);

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        MediaGenService,
        { provide: ApiService, useValue: apiSpy },
      ],
    });

    service = TestBed.inject(MediaGenService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('generateImage()', () => {
    it('should POST image generation params', () => {
      const mockResponse = { success: true, image_url: 'https://example.com/img.png', generation_id: 'gen1' };
      apiSpy.post.and.returnValue(of(mockResponse));

      service.generateImage({ prompt: 'A sunset over mountains' }).subscribe((res) => {
        expect(res.success).toBeTrue();
        expect(res.image_url).toBe('https://example.com/img.png');
      });

      expect(apiSpy.post).toHaveBeenCalledWith(environment.MEDIA_GENERATE_IMAGE, {
        prompt: 'A sunset over mountains',
      });
    });

    it('should include optional params', () => {
      apiSpy.post.and.returnValue(of({ success: true }));

      service.generateImage({
        prompt: 'test',
        style: 'realistic',
        aspect_ratio: '16:9',
        reference_image_url: 'https://ref.com/img.png',
      }).subscribe();

      expect(apiSpy.post).toHaveBeenCalledWith(environment.MEDIA_GENERATE_IMAGE, {
        prompt: 'test',
        style: 'realistic',
        aspect_ratio: '16:9',
        reference_image_url: 'https://ref.com/img.png',
      });
    });

    it('should handle error response', () => {
      apiSpy.post.and.returnValue(of({ success: false, error: 'Content policy violation' }));

      service.generateImage({ prompt: 'bad prompt' }).subscribe((res) => {
        expect(res.success).toBeFalse();
        expect(res.error).toBe('Content policy violation');
      });
    });
  });

  describe('generateVideo()', () => {
    it('should POST video generation params', () => {
      const mockResponse = { success: true, status: 'processing' as const, generation_id: 'vgen1' };
      apiSpy.post.and.returnValue(of(mockResponse));

      service.generateVideo({ script: 'A person talking about shoes' }).subscribe((res) => {
        expect(res.status).toBe('processing');
        expect(res.generation_id).toBe('vgen1');
      });

      expect(apiSpy.post).toHaveBeenCalledWith(environment.MEDIA_GENERATE_VIDEO, {
        script: 'A person talking about shoes',
      });
    });

    it('should include optional params', () => {
      apiSpy.post.and.returnValue(of({ success: true, status: 'processing' }));

      service.generateVideo({
        script: 'test',
        duration: '30s',
        aspect_ratio: '9:16',
        avatar: 'avatar-1',
      }).subscribe();

      expect(apiSpy.post).toHaveBeenCalledWith(environment.MEDIA_GENERATE_VIDEO, {
        script: 'test',
        duration: '30s',
        aspect_ratio: '9:16',
        avatar: 'avatar-1',
      });
    });
  });

  describe('pollVideoStatus()', () => {
    it('should poll GET with generation_id', fakeAsync(() => {
      // Just test a single emission for the basic case
      apiSpy.get.and.returnValue(of({ success: true, status: 'completed' as const, video_url: 'https://v.mp4' }));

      service.pollVideoStatus('vgen1').subscribe((res) => {
        expect(res.status).toBe('completed');
        expect(res.video_url).toBe('https://v.mp4');
      });

      tick(0); // Trigger the initial timer(0, 5000) emission

      expect(apiSpy.get).toHaveBeenCalledWith(environment.MEDIA_VIDEO_STATUS, {
        generation_id: 'vgen1',
      });
    }));
  });
});
