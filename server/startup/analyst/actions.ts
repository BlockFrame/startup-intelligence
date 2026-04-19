export interface StartupAnalystActionEvent {
  type: string;
  label: string;
  prefill: string;
}

export const STARTUP_VISUAL_INTENT_RE =
  /\b(chart|graph|plot|dashboard|visuali[sz]e|compare|benchmark|scorecard|watchlist|tracker|heatmap|trend|matrix|ranking|rank)\b/i;

export function buildStartupActionEvents(query: string): StartupAnalystActionEvent[] {
  if (!STARTUP_VISUAL_INTENT_RE.test(query)) return [];
  return [{
    type: 'suggest-widget',
    label: 'Create investor widget',
    prefill: query,
  }];
}
