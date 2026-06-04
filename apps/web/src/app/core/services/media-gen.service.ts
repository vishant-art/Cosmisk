import { Injectable, inject } from '@angular/core';
import { ApiService } from './api.service';
import { environment } from '../../../environments/environment';
import { Observable, map, switchMap, timer, takeWhile } from 'rxjs';

export interface ImageGenResponse {
  success: boolean;
  image_url?: string;
  generation_id?: string;
  error?: string;
}

export interface VideoGenResponse {
  success: boolean;
  status: 'completed' | 'processing' | 'failed';
  video_url?: string;
  generation_id?: string;
  progress?: number;
  message?: string;
  error?: string;
}

@Injectable({ providedIn: 'root' })
export class MediaGenService {
  private api = inject(ApiService);

  generateImage(params: {
    prompt: string;
    style?: string;
    aspect_ratio?: string;
    reference_image_url?: string;
  }): Observable<ImageGenResponse> {
    return this.api.post<ImageGenResponse>(environment.MEDIA_GENERATE_IMAGE, params);
  }

  generateVideo(params: {
    script: string;
    duration?: string;
    aspect_ratio?: string;
    avatar?: string;
  }): Observable<VideoGenResponse> {
    return this.api.post<VideoGenResponse>(environment.MEDIA_GENERATE_VIDEO, params);
  }

  pollVideoStatus(generationId: string): Observable<VideoGenResponse> {
    return timer(0, 5000).pipe(
      switchMap(() =>
        this.api.get<VideoGenResponse>(environment.MEDIA_VIDEO_STATUS, {
          generation_id: generationId,
        })
      ),
      takeWhile(
        (res) => res.status === 'processing',
        true // include the final emission
      )
    );
  }
}
