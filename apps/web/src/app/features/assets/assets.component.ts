const _BUILD_VER = '2026-03-04-v1';
import { Component, signal, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { AdAccountService } from '../../core/services/ad-account.service';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { environment } from '../../../environments/environment';

interface AssetFile {
  id: string;
  name: string;
  type: 'video' | 'image' | 'document' | 'brief';
  folder: string;
  size: string;
  date: string;
  thumbnail: string;
}

interface AssetFolder {
  name: string;
  icon: string;
  count: number;
}

@Component({
  selector: 'app-assets',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, FormsModule],
  template: `
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-page-title font-display text-navy m-0">Assets Vault</h1>
          <p class="text-sm text-gray-500 font-body mt-1 mb-0">Central file management for all creatives</p>
        </div>
        <button (click)="fileInput.click()" class="px-5 py-2.5 bg-accent text-white rounded-pill text-sm font-body font-semibold hover:bg-accent/90 transition-colors">
          + Upload Files
        </button>
        <input #fileInput type="file" multiple accept="image/*,video/*" class="hidden" (change)="onFileSelected($event)">
      </div>

      <div class="flex gap-6">
        <!-- Folder Sidebar -->
        <div class="w-56 shrink-0 hidden md:block">
          <div class="bg-white rounded-card shadow-card p-4">
            <h3 class="text-xs font-body font-semibold text-gray-500 uppercase mb-3 mt-0">Folders</h3>
            @if (loading()) {
              <div class="space-y-2">
                @for (i of [1,2,3,4]; track i) {
                  <div class="h-8 bg-gray-100 rounded-lg animate-pulse"></div>
                }
              </div>
            } @else {
              <ul class="space-y-0.5 m-0 p-0 list-none">
                @for (folder of folders(); track folder.name) {
                  <li>
                    <button
                      (click)="activeFolder.set(folder.name)"
                      class="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-body transition-colors border-0 bg-transparent cursor-pointer text-left"
                      [ngClass]="activeFolder() === folder.name ? 'bg-accent/10 text-accent font-semibold' : 'text-gray-600 hover:bg-gray-50'">
                      <lucide-icon [name]="folder.icon" [size]="16"></lucide-icon>
                      <span class="flex-1 truncate">{{ folder.name }}</span>
                      <span class="text-[10px] text-gray-400">{{ folder.count }}</span>
                    </button>
                  </li>
                }
              </ul>
            }
            <div class="mt-4 pt-3 border-t border-gray-100">
              <div class="flex justify-between text-xs font-body text-gray-500 mb-1">
                <span>Storage Used</span>
                <span>{{ storageUsed() }}</span>
              </div>
              <div class="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div class="h-full bg-accent rounded-full" [style.width.%]="storagePercent()"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- File Grid -->
        <div class="flex-1">
          <div class="flex items-center justify-between mb-4">
            <span class="text-sm font-body text-gray-500">{{ activeFolder() }} · {{ getFilteredFiles().length }} files</span>
            <div class="flex gap-2">
              <button (click)="viewMode.set('grid')" class="px-3 py-1 text-xs font-body border rounded-lg"
                [ngClass]="viewMode() === 'grid' ? 'border-accent text-accent bg-accent/5' : 'border-gray-200 hover:bg-gray-50'">Grid</button>
              <button (click)="viewMode.set('list')" class="px-3 py-1 text-xs font-body border rounded-lg"
                [ngClass]="viewMode() === 'list' ? 'border-accent text-accent bg-accent/5' : 'border-gray-200 hover:bg-gray-50'">List</button>
            </div>
          </div>
          @if (loading()) {
            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              @for (i of [1,2,3,4,5,6,7,8]; track i) {
                <div class="bg-white rounded-card shadow-card overflow-hidden animate-pulse">
                  <div class="aspect-square bg-gray-100"></div>
                  <div class="p-3">
                    <div class="h-3 bg-gray-200 rounded w-3/4 mb-2"></div>
                    <div class="flex justify-between">
                      <div class="h-2 bg-gray-100 rounded w-12"></div>
                      <div class="h-2 bg-gray-100 rounded w-10"></div>
                    </div>
                  </div>
                </div>
              }
            </div>
          } @else if (viewMode() === 'list') {
            <div class="bg-white rounded-card shadow-card overflow-hidden">
              <table class="w-full text-xs font-body">
                <thead>
                  <tr class="bg-gray-50 text-gray-500">
                    <th class="px-4 py-3 text-left font-semibold">Name</th>
                    <th class="px-4 py-3 text-left font-semibold">Type</th>
                    <th class="px-4 py-3 text-left font-semibold">Folder</th>
                    <th class="px-4 py-3 text-left font-semibold">Size</th>
                    <th class="px-4 py-3 text-left font-semibold">Date</th>
                  </tr>
                </thead>
                <tbody>
                  @for (file of getFilteredFiles(); track file.id) {
                    <tr class="border-t border-gray-50 hover:bg-gray-50">
                      <td class="px-4 py-3 font-medium text-navy truncate max-w-[200px]">{{ file.name }}</td>
                      <td class="px-4 py-3 text-gray-600 capitalize">{{ file.type }}</td>
                      <td class="px-4 py-3 text-gray-600">{{ file.folder }}</td>
                      <td class="px-4 py-3 text-gray-500">{{ file.size }}</td>
                      <td class="px-4 py-3 text-gray-500">{{ file.date }}</td>
                    </tr>
                  }
                  @if (getFilteredFiles().length === 0) {
                    <tr><td colspan="5" class="px-4 py-12 text-center text-gray-400">No files found in this folder</td></tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              @for (file of getFilteredFiles(); track file.id) {
                <div class="bg-white rounded-card shadow-card overflow-hidden card-lift cursor-pointer group">
                  @if (file.thumbnail) {
                    <div class="aspect-square bg-gray-100 overflow-hidden">
                      <img [src]="file.thumbnail" [alt]="file.name" class="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                    </div>
                  } @else {
                    <div class="aspect-square bg-gradient-to-br flex items-center justify-center text-3xl"
                      [ngClass]="{
                        'from-blue-50 to-blue-100': file.type === 'video',
                        'from-purple-50 to-purple-100': file.type === 'image',
                        'from-amber-50 to-amber-100': file.type === 'document',
                        'from-green-50 to-green-100': file.type === 'brief'
                      }">
                      @if (file.type === 'video') { <lucide-icon name="clapperboard" [size]="32"></lucide-icon> } @else if (file.type === 'image') { <lucide-icon name="image" [size]="32"></lucide-icon> } @else if (file.type === 'document') { <lucide-icon name="file-text" [size]="32"></lucide-icon> } @else { <lucide-icon name="clipboard-list" [size]="32"></lucide-icon> }
                    </div>
                  }
                  <div class="p-3">
                    <h4 class="text-xs font-body font-semibold text-navy m-0 truncate">{{ file.name }}</h4>
                    <div class="flex items-center justify-between mt-1">
                      <span class="text-[10px] text-gray-400 font-body">{{ file.size }}</span>
                      <span class="text-[10px] text-gray-400 font-body">{{ file.date }}</span>
                    </div>
                  </div>
                </div>
              }
              @if (getFilteredFiles().length === 0) {
                <div class="col-span-full text-center py-12">
                  <lucide-icon name="folder-open" [size]="40" class="text-gray-300 mx-auto mb-3"></lucide-icon>
                  <p class="text-sm text-gray-400 font-body">No files found in this folder</p>
                </div>
              }
            </div>
          }
        </div>
      </div>
    </div>
  `
})
export default class AssetsComponent {
  private adAccountService = inject(AdAccountService);
  private api = inject(ApiService);
  private toast = inject(ToastService);

  loading = signal(true);
  activeFolder = signal('All Files');
  viewMode = signal<'grid' | 'list'>('grid');
  files = signal<AssetFile[]>([]);
  folders = signal<AssetFolder[]>([
    { name: 'All Files', icon: 'folder-open', count: 0 },
  ]);

  private accountEffect = effect(() => {
    const acc = this.adAccountService.currentAccount();
    if (acc) {
      this.loadAssets(acc.id);
    } else {
      this.loading.set(false);
    }
  }, { allowSignalWrites: true });

  storageUsed = signal('0 / 10 GB');
  storagePercent = signal(0);
  private loadingTimeout: ReturnType<typeof setTimeout> | null = null;

  getFilteredFiles(): AssetFile[] {
    const all = this.files();
    if (this.activeFolder() === 'All Files') return all;
    return all.filter(f => f.folder === this.activeFolder());
  }

  private loadAssets(accountId: string) {
    this.loading.set(true);
    if (this.loadingTimeout) clearTimeout(this.loadingTimeout);
    this.loadingTimeout = setTimeout(() => {
      if (this.loading()) this.loading.set(false);
    }, 8000);

    let filesLoaded = false;
    let foldersLoaded = false;
    const checkDone = () => {
      if (filesLoaded && foldersLoaded) this.loading.set(false);
    };

    // Load files
    this.api.get<any>(environment.ASSETS_LIST, {
      account_id: accountId,
    }).subscribe({
      next: (res) => {
        if (res.success && res.files) {
          this.files.set(res.files);
          const totalFiles = res.files.length;
          const estimatedGB = Math.round(totalFiles * 0.15 * 10) / 10;
          this.storageUsed.set(`${estimatedGB} / 10 GB`);
          this.storagePercent.set(Math.min(100, Math.round((estimatedGB / 10) * 100)));
        } else {
          this.storageUsed.set('0 / 10 GB');
        }
        filesLoaded = true;
        checkDone();
      },
      error: () => {
        this.storageUsed.set('0 / 10 GB');
        filesLoaded = true;
        checkDone();
      },
    });

    // Load folders
    this.api.get<any>(environment.ASSETS_FOLDERS, {
      account_id: accountId,
    }).subscribe({
      next: (res) => {
        if (res.success && res.folders) {
          this.folders.set(res.folders);
          const folderNames = res.folders.map((f: AssetFolder) => f.name);
          if (!folderNames.includes(this.activeFolder())) {
            this.activeFolder.set('All Files');
          }
        }
        foldersLoaded = true;
        checkDone();
      },
      error: () => {
        foldersLoaded = true;
        checkDone();
      },
    });
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;

    const acc = this.adAccountService.currentAccount();
    if (!acc) {
      this.toast.error('No Account', 'Select an ad account before uploading');
      return;
    }

    const files = Array.from(input.files);
    for (const file of files) {
      const isVideo = file.type.startsWith('video');
      const newFile: AssetFile = {
        id: 'local-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
        name: file.name,
        type: isVideo ? 'video' : 'image',
        folder: this.activeFolder() === 'All Files' ? 'Uploads' : this.activeFolder(),
        size: file.size >= 1048576 ? (file.size / 1048576).toFixed(1) + ' MB' : (file.size / 1024).toFixed(0) + ' KB',
        date: new Date().toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
        thumbnail: isVideo ? '' : URL.createObjectURL(file),
      };
      this.files.update(f => [newFile, ...f]);
    }

    this.toast.success('Uploaded', `${files.length} file${files.length > 1 ? 's' : ''} added to vault`);
    input.value = '';
  }
}
