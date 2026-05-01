export const config = { runtime: 'edge', regions: ['iad1', 'lhr1', 'fra1', 'sfo1'] };

import { createStartupDomainGateway, serverOptions } from '../../../server/gateway';
import { createNewsServiceRoutes } from '../../../src/generated/server/startup_intelligence/news/v1/service_server';
import { newsHandler } from '../../../server/startup/news/v1/handler';

export default createStartupDomainGateway(
  createNewsServiceRoutes(newsHandler, serverOptions),
);
