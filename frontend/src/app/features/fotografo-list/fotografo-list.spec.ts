import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { FotografoList } from './fotografo-list';

describe('FotografoList', () => {
  let component: FotografoList;
  let fixture: ComponentFixture<FotografoList>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FotografoList],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(FotografoList);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
