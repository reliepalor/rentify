import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TenantProfileModal } from './tenant-profile-modal';

describe('TenantProfileModal', () => {
  let component: TenantProfileModal;
  let fixture: ComponentFixture<TenantProfileModal>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TenantProfileModal]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TenantProfileModal);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
