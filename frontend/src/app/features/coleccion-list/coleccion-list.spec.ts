import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ColeccionList } from './coleccion-list';

describe('ColeccionList', () => {
  let component: ColeccionList;
  let fixture: ComponentFixture<ColeccionList>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ColeccionList],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(ColeccionList);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
