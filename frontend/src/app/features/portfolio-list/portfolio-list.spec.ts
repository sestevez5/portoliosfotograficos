import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { PortfolioList } from './portfolio-list';

describe('PortfolioList', () => {
  let component: PortfolioList;
  let fixture: ComponentFixture<PortfolioList>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PortfolioList],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(PortfolioList);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
