import { isDesktopRuntime, toApiUrl } from '@/services/runtime';

/**
 * The GitHub dashboard endpoints are deployed with the web app. Keep browser
 * requests on the current Vercel origin so they cannot stall behind the
 * separate Cloudflare API hostname. Desktop builds still use the sidecar.
 */
export function toGithubRepoApiUrl(path: string): string {
  if (typeof window === 'undefined' || isDesktopRuntime()) {
    return toApiUrl(path);
  }

  return new URL(path, window.location.origin).toString();
}
