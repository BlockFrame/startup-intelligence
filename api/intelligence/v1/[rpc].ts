export const config = { runtime: 'edge', regions: ['iad1', 'lhr1', 'fra1', 'sfo1'] };

import { createStartupDomainGateway, serverOptions } from '../../../server/gateway';
import { createIntelligenceServiceRoutes } from '../../../src/generated/server/startup_intelligence/intelligence/v1/service_server';
import { intelligenceHandler } from '../../../server/startup/intelligence/v1/handler';

export default createStartupDomainGateway(
  createIntelligenceServiceRoutes(intelligenceHandler, serverOptions),
);
