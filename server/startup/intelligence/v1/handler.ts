import type { IntelligenceServiceHandler } from '../../../../src/generated/server/worldmonitor/intelligence/v1/service_server';

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
  getRiskScores: legacyUnavailableRpc('getRiskScores') as IntelligenceServiceHandler['getRiskScores'],
  getCountryRisk: legacyUnavailableRpc('getCountryRisk') as IntelligenceServiceHandler['getCountryRisk'],
  getPizzintStatus: legacyUnavailableRpc('getPizzintStatus') as IntelligenceServiceHandler['getPizzintStatus'],
  classifyEvent: legacyUnavailableRpc('classifyEvent') as IntelligenceServiceHandler['classifyEvent'],
  getCountryIntelBrief: legacyUnavailableRpc('getCountryIntelBrief') as IntelligenceServiceHandler['getCountryIntelBrief'],
  searchGdeltDocuments: legacyUnavailableRpc('searchGdeltDocuments') as IntelligenceServiceHandler['searchGdeltDocuments'],
  deductSituation: legacyUnavailableRpc('deductSituation') as IntelligenceServiceHandler['deductSituation'],
  getCountryFacts: legacyUnavailableRpc('getCountryFacts') as IntelligenceServiceHandler['getCountryFacts'],
  listSecurityAdvisories,
  listSatellites: legacyUnavailableRpc('listSatellites') as IntelligenceServiceHandler['listSatellites'],
  listGpsInterference: legacyUnavailableRpc('listGpsInterference') as IntelligenceServiceHandler['listGpsInterference'],
  listOrefAlerts: legacyUnavailableRpc('listOrefAlerts') as IntelligenceServiceHandler['listOrefAlerts'],
  listTelegramFeed,
  getCompanyEnrichment,
  listCompanySignals,
  getGdeltTopicTimeline,
  listCrossSourceSignals,
  listMarketImplications,
  getSocialVelocity,
  getCountryEnergyProfile: legacyUnavailableRpc('getCountryEnergyProfile') as IntelligenceServiceHandler['getCountryEnergyProfile'],
  computeEnergyShockScenario: legacyUnavailableRpc('computeEnergyShockScenario') as IntelligenceServiceHandler['computeEnergyShockScenario'],
  getCountryPortActivity: legacyUnavailableRpc('getCountryPortActivity') as IntelligenceServiceHandler['getCountryPortActivity'],
  getRegionalSnapshot: legacyUnavailableRpc('getRegionalSnapshot') as IntelligenceServiceHandler['getRegionalSnapshot'],
  getRegimeHistory: legacyUnavailableRpc('getRegimeHistory') as IntelligenceServiceHandler['getRegimeHistory'],
  getRegionalBrief: legacyUnavailableRpc('getRegionalBrief') as IntelligenceServiceHandler['getRegionalBrief'],
};
