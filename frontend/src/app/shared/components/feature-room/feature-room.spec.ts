import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FeatureRoom } from './feature-room';

describe('FeatureRoom', () => {
  let component: FeatureRoom;
  let fixture: ComponentFixture<FeatureRoom>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FeatureRoom]
    })
    .compileComponents();

    fixture = TestBed.createComponent(FeatureRoom);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
