import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AlbumList } from './album-list';

describe('AlbumList', () => {
  let component: AlbumList;
  let fixture: ComponentFixture<AlbumList>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AlbumList],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(AlbumList);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
