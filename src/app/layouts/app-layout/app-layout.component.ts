import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { SidebarComponent } from '../../shared/components/sidebar/sidebar.component';
import { TopbarComponent } from '../../shared/components/topbar/topbar.component';
import { ToastComponent } from '../../shared/components/toast/toast.component';
import { CommandPaletteComponent } from '../../shared/components/command-palette/command-palette.component';

@Component({
  selector: 'app-app-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, SidebarComponent, TopbarComponent, ToastComponent, CommandPaletteComponent],
  template: `
    <div class="min-h-screen bg-[#F7F8FA]">
      <app-sidebar (collapsedChange)="sidebarCollapsed.set($event)" />

      <div class="transition-all duration-300"
        [style.margin-left.px]="sidebarCollapsed() ? 72 : 260">
        <app-topbar />

        <main class="p-4 md:p-8">
          <div class="route-animate" [attr.data-route]="routeKey">
            <router-outlet (activate)="onRouteActivate()" />
          </div>
        </main>
      </div>

      <app-toast />
      <app-command-palette />
    </div>
  `
})
export class AppLayoutComponent {
  sidebarCollapsed = signal(false);
  routeKey = 0;

  onRouteActivate() {
    this.routeKey++;
  }
}
