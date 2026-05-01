type EscalationMap = {
  initEscalationGetters?: () => void;
};

export const WORLD_MONITOR_PRO_URL = 'https://worldmonitor.app/pro';

export function openLegacyProPage(): void {
  window.open(WORLD_MONITOR_PRO_URL, '_blank');
}

export async function fetchLegacyGitHubStars(): Promise<void> {
  try {
    const response = await fetch('https://api.github.com/repos/koala73/worldmonitor');
    if (!response.ok) return;
    const data = await response.json();
    const starsEl = document.getElementById('githubStars');
    if (starsEl) {
      const count = data.stargazers_count;
      const k = Math.round(count / 1000);
      starsEl.textContent = `${k}k`;
    }
  } catch {
    // Best-effort legacy badge.
  }
}

export function initLegacyMapEscalationGetters(map: unknown): void {
  (map as EscalationMap).initEscalationGetters?.();
}

export function renderLegacyHeaderLinks(viewOnGitHubLabel: string): string {
  return `<a href="https://x.com/eliehabib" target="_blank" rel="noopener" class="credit-link">
            <svg class="x-logo" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            <span class="credit-text">@eliehabib</span>
          </a>
          <a href="https://github.com/koala73/worldmonitor" target="_blank" rel="noopener" class="github-link" title="${viewOnGitHubLabel}">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
            <span class="github-stars" id="githubStars"></span>
          </a>`;
}

export function renderLegacyMobileFooterLinks(isDesktopApp: boolean): string {
  return `<a href="${isDesktopApp ? 'https://worldmonitor.app/pro' : 'https://www.worldmonitor.app/pro'}" target="_blank" rel="noopener">Pro</a>
          <a href="${isDesktopApp ? 'https://worldmonitor.app/blog/' : 'https://www.worldmonitor.app/blog/'}" target="_blank" rel="noopener">Blog</a>
          <a href="${isDesktopApp ? 'https://worldmonitor.app/docs' : 'https://www.worldmonitor.app/docs'}" target="_blank" rel="noopener">Docs</a>
          <a href="https://status.worldmonitor.app/" target="_blank" rel="noopener">Status</a>`;
}

export function renderLegacyFooterLinks(isDesktopApp: boolean): string {
  return `<a href="${isDesktopApp ? 'https://worldmonitor.app/pro' : 'https://www.worldmonitor.app/pro'}" target="_blank" rel="noopener">Pro</a>
          <a href="${isDesktopApp ? 'https://worldmonitor.app/blog/' : 'https://www.worldmonitor.app/blog/'}" target="_blank" rel="noopener">Blog</a>
          <a href="${isDesktopApp ? 'https://worldmonitor.app/docs' : 'https://www.worldmonitor.app/docs'}" target="_blank" rel="noopener">Docs</a>
          <a href="https://status.worldmonitor.app/" target="_blank" rel="noopener">Status</a>
          <a href="https://github.com/koala73/worldmonitor" target="_blank" rel="noopener">GitHub</a>
          <a href="https://discord.gg/re63kWKxaz" target="_blank" rel="noopener">Discord</a>
          <a href="https://x.com/worldmonitorai" target="_blank" rel="noopener">X</a>
          ${isDesktopApp ? '' : `<span id="footerDownloadMount"></span>`}`;
}
