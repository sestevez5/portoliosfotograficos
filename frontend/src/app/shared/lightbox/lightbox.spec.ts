import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Lightbox } from './lightbox';

describe('Lightbox', () => {
  let component: Lightbox;
  let fixture: ComponentFixture<Lightbox>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Lightbox],
    }).compileComponents();

    fixture = TestBed.createComponent(Lightbox);
    fixture.componentRef.setInput('photos', [
      { id: 'p1', filename: '01.jpg', order: 1, url: '/photos/demo/01.jpg' },
    ]);
    fixture.componentRef.setInput('index', 0);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
