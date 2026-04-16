import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TenantProfile } from './tenant-profile';

describe('TenantProfile', () => {
  let component: TenantProfile;
  let fixture: ComponentFixture<TenantProfile>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TenantProfile]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TenantProfile);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
