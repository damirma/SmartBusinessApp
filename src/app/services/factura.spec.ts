import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';

import { FacturaService } from './factura';

describe('FacturaService', () => {
  let service: FacturaService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient()]
    });
    service = TestBed.inject(FacturaService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
