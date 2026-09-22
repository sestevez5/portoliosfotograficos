import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AlbumDetail } from './album-detail';

describe('AlbumDetail', () => {
  let component: AlbumDetail;
  let fixture: ComponentFixture<AlbumDetail>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AlbumDetail],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: ':fotografo/albums/:id', component: AlbumDetail }]),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AlbumDetail);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

