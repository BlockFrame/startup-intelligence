export const config = { runtime: 'edge' };

import { createStartupDomainGateway, serverOptions } from '../../../server/gateway';
import { createMarketServiceRoutes } from '../../../src/generated/server/worldmonitor/market/v1/service_server';
import { marketHandler } from '../../../server/startup/market/v1/handler';

export default createStartupDomainGateway(
  createMarketServiceRoutes(marketHandler, serverOptions),
);
