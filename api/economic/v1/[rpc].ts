export const config = { runtime: 'edge' };

import { createStartupDomainGateway, serverOptions } from '../../../server/gateway';
import { createEconomicServiceRoutes } from '../../../src/generated/server/worldmonitor/economic/v1/service_server';
import { economicHandler } from '../../../server/startup/economic/v1/handler';

export default createStartupDomainGateway(
  createEconomicServiceRoutes(economicHandler, serverOptions),
);
