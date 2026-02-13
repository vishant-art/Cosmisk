const _BUILD_VER = '2026-02-13-v2';
import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

interface AssetFile {
  id: string;
  name: string;
  type: 'video' | 'image' | 'document' | 'brief';
  folder: string;
  size: string;
  date: string;
  thumbnail: string;
}

@Component({
  selector: 'app-assets',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-page-title font-display text-navy m-0">Assets Vault</h1>
          <p class="text-sm text-gray-500 font-body mt-1 mb-0">Central file management for all creatives</p>
        </div>
        <button class="px-5 py-2.5 bg-accent text-white rounded-pill text-sm font-body font-semibold hover:bg-accent/90 transition-colors">
          + Upload Files
        </button>
      </div>

      <div class="flex gap-6">
        <!-- Folder Sidebar -->
        <div class="w-56 shrink-0 hidden md:block">
          <div class="bg-white rounded-card shadow-card p-4">
            <h3 class="text-xs font-body font-semibold text-gray-500 uppercase mb-3 mt-0">Folders</h3>
            <ul class="space-y-0.5 m-0 p-0 list-none">
              @for (folder of folders; track folder.name) {
                <li>
                  <button
                    (click)="activeFolder.set(folder.name)"
                    class="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-body transition-colors border-0 bg-transparent cursor-pointer text-left"
                    [ngClass]="activeFolder() === folder.name ? 'bg-accent/10 text-accent font-semibold' : 'text-gray-600 hover:bg-gray-50'">
                    <span>{{ folder.icon }}</span>
                    <span class="flex-1">{{ folder.name }}</span>
                    <span class="text-[10px] text-gray-400">{{ folder.count }}</span>
                  </button>
                </li>
              }
            </ul>
            <div class="mt-4 pt-3 border-t border-gray-100">
              <div class="flex justify-between text-xs font-body text-gray-500 mb-1">
                <span>Storage Used</span>
                <span>4.2 / 10 GB</span>
              </div>
              <div class="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div class="h-full bg-accent rounded-full" style="width: 42%"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- File Grid -->
        <div class="flex-1">
          <div class="flex items-center justify-between mb-4">
            <span class="text-sm font-body text-gray-500">{{ activeFolder() }} · {{ getFilteredFiles().length }} files</span>
            <div class="flex gap-2">
              <button class="px-3 py-1 text-xs font-body border border-gray-200 rounded-lg hover:bg-gray-50">Grid</button>
              <button class="px-3 py-1 text-xs font-body border border-gray-200 rounded-lg hover:bg-gray-50">List</button>
            </div>
          </div>
          <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            @for (file of getFilteredFiles(); track file.id) {
              <div class="bg-white rounded-card shadow-card overflow-hidden hover:shadow-card-hover transition-all cursor-pointer group">
                <div class="aspect-square bg-gradient-to-br flex items-center justify-center text-3xl"
                  [ngClass]="{
                    'from-blue-50 to-blue-100': file.type === 'video',
                    'from-purple-50 to-purple-100': file.type === 'image',
                    'from-amber-50 to-amber-100': file.type === 'document',
                    'from-green-50 to-green-100': file.type === 'brief'
                  }">
                  {{ file.type === 'video' ? '🎬' : file.type === 'image' ? '🖼️' : file.type === 'document' ? '📄' : '📋' }}
                </div>
                <div class="p-3">
                  <h4 class="text-xs font-body font-semibold text-navy m-0 truncate">{{ file.name }}</h4>
                  <div class="flex items-center justify-between mt-1">
                    <span class="text-[10px] text-gray-400 font-body">{{ file.size }}</span>
                    <span class="text-[10px] text-gray-400 font-body">{{ file.date }}</span>
                  </div>
                </div>
              </div>
            }
          </div>
        </div>
      </div>
    </div>
  `
})
export default class AssetsComponent {
  activeFolder = signal('All Files');

  folders = [
    { name: 'All Files', icon: '📁', count: 10 },
    { name: 'Creatives', icon: '🎨', count: 4 },
    { name: 'UGC Videos', icon: '📹', count: 2 },
    { name: 'Briefs', icon: '📋', count: 2 },
    { name: 'Reports', icon: '📄', count: 1 },
    { name: 'Brand Kit', icon: '🏷️', count: 1 },
  ];

  files: AssetFile[] = [
    { id: 'f-1', name: 'Collagen Glow-Up.mp4', type: 'video', folder: 'Creatives', size: '24.5 MB', date: 'Feb 10', thumbnail: '' },
    { id: 'f-2', name: 'Morning Routine Reel.mp4', type: 'video', folder: 'Creatives', size: '18.2 MB', date: 'Feb 8', thumbnail: '' },
    { id: 'f-3', name: '₹999 Offer Banner.png', type: 'image', folder: 'Creatives', size: '1.2 MB', date: 'Feb 6', thumbnail: '' },
    { id: 'f-4', name: 'Before After Carousel.zip', type: 'image', folder: 'Creatives', size: '8.4 MB', date: 'Feb 4', thumbnail: '' },
    { id: 'f-5', name: 'Priya - Collagen Script.mp4', type: 'video', folder: 'UGC Videos', size: '32.1 MB', date: 'Feb 9', thumbnail: '' },
    { id: 'f-6', name: 'Rahul - Summer Sale.mp4', type: 'video', folder: 'UGC Videos', size: '15.8 MB', date: 'Feb 7', thumbnail: '' },
    { id: 'f-7', name: 'CB-0247 Brief.pdf', type: 'brief', folder: 'Briefs', size: '2.1 MB', date: 'Feb 11', thumbnail: '' },
    { id: 'f-8', name: 'CB-0246 Brief.pdf', type: 'brief', folder: 'Briefs', size: '1.8 MB', date: 'Feb 5', thumbnail: '' },
    { id: 'f-9', name: 'Jan 2024 Performance.pdf', type: 'document', folder: 'Reports', size: '3.2 MB', date: 'Feb 1', thumbnail: '' },
    { id: 'f-10', name: 'Brand Guidelines.pdf', type: 'document', folder: 'Brand Kit', size: '5.6 MB', date: 'Jan 15', thumbnail: '' },
  ];

  getFilteredFiles(): AssetFile[] {
    if (this.activeFolder() === 'All Files') return this.files;
    return this.files.filter(f => f.folder === this.activeFolder());
  }
}
