import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ColeccionDetail } from './coleccion-detail';

describe('ColeccionDetail', () => {
  let component: ColeccionDetail;
  let fixture: ComponentFixture<ColeccionDetail>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ColeccionDetail],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: ':fotografo/:portfolio/:coleccion', component: ColeccionDetail }]),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ColeccionDetail);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

