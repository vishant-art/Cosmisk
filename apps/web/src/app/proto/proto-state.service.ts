import { Injectable, signal, computed } from '@angular/core';
import { DEMO_EMAIL, DISCOVERED_BRAND, DiscoveredBrand } from './proto-data';

/**
 * SLICE 1 PROTOTYPE STATE
 *
 * In-memory only. No HTTP, no localStorage, no auth service, no guards.
 * Refreshing the browser resets the journey to the start — this is intentional
 * so every review run is identical and deterministic.
 */
@Injectable({ providedIn: 'root' })
export class ProtoStateService {
  /**
   * Seeded with the demo identity so a reviewer can deep-link straight to any
   * screen and still see realistic data. Signup/login overwrite it.
   */
  readonly email = signal<string>(DEMO_EMAIL);
  readonly firstName = computed(() => {
    const local = this.email().split('@')[0].replace(/[._-].*$/, '');
    return local.charAt(0).toUpperCase() + local.slice(1);
  });

  /** The only thing onboarding asks for. Everything else is discovered. */
  readonly websiteUrl = signal<string>('');

  /** Demo vs "connected". In the prototype BOTH are simulated — see report. */
  readonly isDemo = signal<boolean>(true);

  /** What discovery "found". Editable on the discovery screen. */
  readonly brand = signal<DiscoveredBrand>({ ...DISCOVERED_BRAND });

  /** Marks that the user has seen the first finding, so the dashboard can change copy. */
  readonly hasSeenFinding = signal<boolean>(false);

  /**
   * The LEARNING half of the loop. Once the user says they acted on the finding,
   * Cosmisk stops repeating the recommendation and starts measuring it instead.
   */
  readonly findingActioned = signal<boolean>(false);

  setDemo(v: boolean) {
    this.isDemo.set(v);
  }

  patchBrand(patch: Partial<DiscoveredBrand>) {
    this.brand.update((b) => ({ ...b, ...patch }));
  }

  reset() {
    this.email.set(DEMO_EMAIL);
    this.websiteUrl.set('');
    this.isDemo.set(true);
    this.brand.set({ ...DISCOVERED_BRAND });
    this.hasSeenFinding.set(false);
    this.findingActioned.set(false);
  }
}
