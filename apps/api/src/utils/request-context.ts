import { AsyncLocalStorage } from 'node:async_hooks';

export interface CorrelationContext {
  correlationId: string;
  parentRequestId?: string;
}

export const correlationStore = new AsyncLocalStorage<CorrelationContext>();

/** Returns the active correlationId, or undefined outside any context. */
export function getCorrelationId(): string | undefined {
  return correlationStore.getStore()?.correlationId;
}
