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
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should display the title', () => {
    component.title = 'No items found';
    fixture.detectChanges();
    const h3 = fixture.nativeElement.querySelector('h3');
    expect(h3.textContent).toContain('No items found');
  });

  it('should display the description when provided', () => {
    component.title = 'Empty';
    component.description = 'Try adding some items';
    fixture.detectChanges();
    const p = fixture.nativeElement.querySelector('p.text-sm');
    expect(p.textContent).toContain('Try adding some items');
  });

  it('should display the default icon', () => {
    component.title = 'Empty';
    fixture.detectChanges();
    const iconSpan = fixture.nativeElement.querySelector('.text-4xl');
    expect(iconSpan.textContent.trim()).toBe('\u{1F4ED}');
  });

  it('should display a custom icon', () => {
    component.title = 'Empty';
    component.icon = '\u{1F50D}';
    fixture.detectChanges();
    const iconSpan = fixture.nativeElement.querySelector('.text-4xl');
    expect(iconSpan.textContent.trim()).toBe('\u{1F50D}');
  });

  it('should show action button when actionLabel is provided', () => {
    component.title = 'Empty';
    component.actionLabel = 'Add Item';
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('button.btn-primary');
    expect(button).toBeTruthy();
    expect(button.textContent).toContain('Add Item');
  });

  it('should not show action button when actionLabel is empty', () => {
    component.title = 'Empty';
    component.actionLabel = '';
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('button.btn-primary');
    expect(button).toBeNull();
  });
});
