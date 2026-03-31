import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EmptyStateComponent } from './empty-state.component';

describe('EmptyStateComponent', () => {
  let component: EmptyStateComponent;
  let fixture: ComponentFixture<EmptyStateComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EmptyStateComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(EmptyStateComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have default icon', () => {
    expect(component.icon).toBeTruthy();
  });

  it('should accept title input', () => {
    component.title = 'No data yet';
    expect(component.title).toBe('No data yet');
  });

  it('should accept description input', () => {
    component.description = 'Start by creating a campaign.';
    expect(component.description).toBe('Start by creating a campaign.');
  });

  it('should default description to empty string', () => {
    expect(component.description).toBe('');
  });

  it('should default actionLabel to empty string', () => {
    expect(component.actionLabel).toBe('');
  });

  it('should accept actionLabel input', () => {
    component.actionLabel = 'Create Campaign';
    expect(component.actionLabel).toBe('Create Campaign');
  });

  it('should render title text', () => {
    component.title = 'Nothing here';
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Nothing here');
  });

  it('should render action button when actionLabel is set', () => {
    component.title = 'Empty';
    component.actionLabel = 'Add Item';
    fixture.detectChanges();
    const btn = (fixture.nativeElement as HTMLElement).querySelector('button');
    expect(btn).toBeTruthy();
    expect(btn?.textContent).toContain('Add Item');
  });

  it('should not render action button when actionLabel is empty', () => {
    component.title = 'Empty';
    component.actionLabel = '';
    fixture.detectChanges();
    const btn = (fixture.nativeElement as HTMLElement).querySelector('button');
    expect(btn).toBeNull();
  });
});
