import type { AppContext, AppModule } from '@/app/app-context';
import { getCountryAtCoordinates } from '@/services/country-geometry';
import { trackCountrySelected } from '@/services/analytics';
import { toFlagEmoji } from '@/utils/country-flag';

type IntlDisplayNamesCtor = new (
  locales: string | string[],
  options: { type: 'region' }
) => { of: (code: string) => string | undefined };

export class CountryIntelManager implements AppModule {
  constructor(private readonly ctx: AppContext) {}

  init(): void {
    if (!this.ctx.map) return;
    this.ctx.map.onCountryClicked((countryClick) => {
      if (countryClick.code && countryClick.name) {
        trackCountrySelected(countryClick.code, countryClick.name, 'map');
        void this.openCountryBriefByCode(countryClick.code, countryClick.name);
        return;
      }
      void this.openCountryBrief(countryClick.lat, countryClick.lon);
    });
  }

  destroy(): void {
    this.ctx.countryBriefPage = null;
    this.ctx.countryTimeline?.destroy();
    this.ctx.countryTimeline = null;
  }

  async openCountryBrief(lat: number, lon: number): Promise<void> {
    const country = getCountryAtCoordinates(lat, lon);
    if (!country) return;
    await this.openCountryBriefByCode(country.code, country.name);
  }

  async openCountryBriefByCode(code: string, country: string, opts?: { maximize?: boolean }): Promise<void> {
    void opts;
    const name = country || CountryIntelManager.resolveCountryName(code);
    this.ctx.map?.highlightCountry(code);
    this.ctx.map?.fitCountry(code);
    trackCountrySelected(code, name, 'startup-country-focus');
  }

  refreshOpenBrief(): void {}

  openCountryStory(code: string, name: string): void {
    void this.openCountryBriefByCode(code, name);
  }

  static resolveCountryName(code: string): string {
    const normalized = code.toUpperCase();
    try {
      const DisplayNames = Intl.DisplayNames as IntlDisplayNamesCtor | undefined;
      const name = DisplayNames ? new DisplayNames(['en'], { type: 'region' }).of(normalized) : undefined;
      if (name) return name;
    } catch {
      // Fall through to the stable code label.
    }
    return normalized;
  }

  static toFlagEmoji(code: string): string {
    return toFlagEmoji(code);
  }
}
