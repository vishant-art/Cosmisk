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

  describe('get', () => {
    it('should make a GET request to the correct URL', () => {
      service.get<{ data: string }>('test/endpoint').subscribe(res => {
        expect(res).toEqual({ data: 'value' });
      });

      const req = httpMock.expectOne(`${base}/test/endpoint`);
      expect(req.request.method).toBe('GET');
      req.flush({ data: 'value' });
    });

    it('should pass query params', () => {
      service.get<any>('test/endpoint', { page: 1, active: true, name: 'foo' }).subscribe();

      const req = httpMock.expectOne(r => r.url === `${base}/test/endpoint`);
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

  describe('post', () => {
    it('should make a POST request with body', () => {
      const body = { email: 'test@test.com', password: '123' };
      service.post<any>('auth/login', body).subscribe(res => {
        expect(res).toEqual({ token: 'abc' });
      });

      const req = httpMock.expectOne(`${base}/auth/login`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(body);
      req.flush({ token: 'abc' });
    });
  });

  describe('put', () => {
    it('should make a PUT request with body', () => {
      const body = { name: 'updated' };
      service.put<any>('items/1', body).subscribe(res => {
        expect(res).toEqual({ success: true });
      });

      const req = httpMock.expectOne(`${base}/items/1`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual(body);
      req.flush({ success: true });
    });
  });

  describe('delete', () => {
    it('should make a DELETE request', () => {
      service.delete<any>('items/1').subscribe(res => {
        expect(res).toEqual({ success: true });
      });

      const req = httpMock.expectOne(`${base}/items/1`);
      expect(req.request.method).toBe('DELETE');
      req.flush({ success: true });
    });
  });
});
