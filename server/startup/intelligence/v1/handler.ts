import type { IntelligenceServiceHandler } from '../../../../src/generated/server/startup_intelligence/intelligence/v1/service_server';

import { listSecurityAdvisories } from './list-security-advisories';
import { listTelegramFeed } from './list-telegram-feed';
import { getCompanyEnrichment } from './get-company-enrichment';
import { listCompanySignals } from './list-company-signals';
import { getGdeltTopicTimeline } from './get-gdelt-topic-timeline';
import { listCrossSourceSignals } from './list-cross-source-signals';
import { listMarketImplications } from './list-market-implications';
import { getSocialVelocity } from './get-social-velocity';
import { legacyUnavailableRpc } from './legacy-unavailable';

export const intelligenceHandler: IntelligenceServiceHandler = {
  getRiskScores: legacyUnavailableRpc('getRiskScores') as unknown as IntelligenceServiceHandler['getRiskScores'],
  getCountryRisk: legacyUnavailableRpc('getCountryRisk') as unknown as IntelligenceServiceHandler['getCountryRisk'],
  getPizzintStatus: legacyUnavailableRpc('getPizzintStatus') as unknown as IntelligenceServiceHandler['getPizzintStatus'],
  classifyEvent: legacyUnavailableRpc('classifyEvent') as unknown as IntelligenceServiceHandler['classifyEvent'],
  getCountryIntelBrief: legacyUnavailableRpc('getCountryIntelBrief') as unknown as IntelligenceServiceHandler['getCountryIntelBrief'],
  searchGdeltDocuments: legacyUnavailableRpc('searchGdeltDocuments') as unknown as IntelligenceServiceHandler['searchGdeltDocuments'],
  deductSituation: legacyUnavailableRpc('deductSituation') as unknown as IntelligenceServiceHandler['deductSituation'],
  getCountryFacts: legacyUnavailableRpc('getCountryFacts') as unknown as IntelligenceServiceHandler['getCountryFacts'],
  listSecurityAdvisories,
  listSatellites: legacyUnavailableRpc('listSatellites') as unknown as IntelligenceServiceHandler['listSatellites'],
  listGpsInterference: legacyUnavailableRpc('listGpsInterference') as unknown as IntelligenceServiceHandler['listGpsInterference'],
  listOrefAlerts: legacyUnavailableRpc('listOrefAlerts') as unknown as IntelligenceServiceHandler['listOrefAlerts'],
  listTelegramFeed,
  getCompanyEnrichment,
  listCompanySignals,
  getGdeltTopicTimeline,
  listCrossSourceSignals,
  listMarketImplications,
  getSocialVelocity,
  getCountryEnergyProfile: legacyUnavailableRpc('getCountryEnergyProfile') as unknown as IntelligenceServiceHandler['getCountryEnergyProfile'],
  computeEnergyShockScenario: legacyUnavailableRpc('computeEnergyShockScenario') as unknown as IntelligenceServiceHandler['computeEnergyShockScenario'],
  getCountryPortActivity: legacyUnavailableRpc('getCountryPortActivity') as unknown as IntelligenceServiceHandler['getCountryPortActivity'],
  getRegionalSnapshot: legacyUnavailableRpc('getRegionalSnapshot') as unknown as IntelligenceServiceHandler['getRegionalSnapshot'],
  getRegimeHistory: legacyUnavailableRpc('getRegimeHistory') as unknown as IntelligenceServiceHandler['getRegimeHistory'],
  getRegionalBrief: legacyUnavailableRpc('getRegionalBrief') as unknown as IntelligenceServiceHandler['getRegionalBrief'],
};
