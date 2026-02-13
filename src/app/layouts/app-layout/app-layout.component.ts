import { Component } from '@angular/core';
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
    <div class="min-h-screen bg-cream">
      <app-sidebar />

      <div class="transition-all duration-300 ml-[260px]">
        <app-topbar />

        <main class="p-8 animate-page-enter">
          <router-outlet />
        </main>
      </div>

      <app-toast />
      <app-command-palette />
    </div>
  `
})
export class AppLayoutComponent {}
