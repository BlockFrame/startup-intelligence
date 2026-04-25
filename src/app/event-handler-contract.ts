import type { AppModule } from '@/app/app-context';

export interface EventHandlerController extends AppModule {
  startHeaderClock(): void;
  setupPlaybackControl(): Promise<void>;
  setupStatusPanel(): Promise<void>;
  setupPizzIntIndicator(): Promise<void>;
  setupLlmStatusIndicator(): Promise<void>;
  setupExportPanel(): Promise<void>;
  setupUnifiedSettings(): Promise<void>;
  setupAuthWidget(): Promise<void>;
  setupMapLayerHandlers(): void;
  setupUrlStateSync(): void;
  syncUrlState(): void;
  setupSnapshotSaving(): void;
  setupPanelViewTracking(): void;
}
