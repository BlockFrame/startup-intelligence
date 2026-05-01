export const config = { runtime: 'edge' };

import { createStartupDomainGateway, serverOptions } from '../../../server/gateway';
import { createResearchServiceRoutes } from '../../../src/generated/server/startup_intelligence/research/v1/service_server';
import { researchHandler } from '../../../server/startup/research/v1/handler';

export default createStartupDomainGateway(
  createResearchServiceRoutes(researchHandler, serverOptions),
);
