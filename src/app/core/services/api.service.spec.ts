import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ApiService } from './api.service';
import { environment } from '../../../environments/environment';

describe('ApiService', () => {
  let service: ApiService;
  let httpMock: HttpTestingController;
  const base = environment.API_BASE_URL;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [ApiService],
    });
    service = TestBed.inject(ApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('get()', () => {
    it('should make a GET request to the correct URL', () => {
      service.get<{ data: string }>('test/endpoint').subscribe((res) => {
        expect(res.data).toBe('hello');
      });

      const req = httpMock.expectOne(`${base}/test/endpoint`);
      expect(req.request.method).toBe('GET');
      req.flush({ data: 'hello' });
    });

    it('should pass query params when provided', () => {
      service.get<any>('test/endpoint', { page: 1, active: true, name: 'foo' }).subscribe();

      const req = httpMock.expectOne((r) => r.url === `${base}/test/endpoint`);
      expect(req.request.params.get('page')).toBe('1');
      expect(req.request.params.get('active')).toBe('true');
      expect(req.request.params.get('name')).toBe('foo');
      req.flush({});
    });

    it('should work without params', () => {
      service.get<any>('no-params').subscribe();

      const req = httpMock.expectOne(`${base}/no-params`);
      expect(req.request.params.keys().length).toBe(0);
      req.flush({});
    });
  });

  describe('post()', () => {
    it('should make a POST request with body', () => {
      const body = { email: 'test@example.com', password: 'secret' };
      service.post<{ token: string }>('auth/login', body).subscribe((res) => {
        expect(res.token).toBe('abc123');
      });

      const req = httpMock.expectOne(`${base}/auth/login`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(body);
      req.flush({ token: 'abc123' });
    });
  });

  describe('put()', () => {
    it('should make a PUT request with body', () => {
      const body = { name: 'Updated' };
      service.put<{ success: boolean }>('settings/profile', body).subscribe((res) => {
        expect(res.success).toBeTrue();
      });

      const req = httpMock.expectOne(`${base}/settings/profile`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual(body);
      req.flush({ success: true });
    });
  });

  describe('delete()', () => {
    it('should make a DELETE request', () => {
      service.delete<{ success: boolean }>('items/123').subscribe((res) => {
        expect(res.success).toBeTrue();
      });

      const req = httpMock.expectOne(`${base}/items/123`);
      expect(req.request.method).toBe('DELETE');
      req.flush({ success: true });
    });
  });

  describe('error handling', () => {
    it('should propagate HTTP errors', () => {
      let errorResponse: any;
      service.get<any>('bad-endpoint').subscribe({
        error: (err) => {
          errorResponse = err;
        },
      });

      const req = httpMock.expectOne(`${base}/bad-endpoint`);
      req.flush('Server error', { status: 500, statusText: 'Internal Server Error' });

      expect(errorResponse).toBeTruthy();
      expect(errorResponse.status).toBe(500);
    });
  });
});
