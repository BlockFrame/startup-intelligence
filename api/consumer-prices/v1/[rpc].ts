export const config = { runtime: 'edge' };

import { createStartupDomainGateway, serverOptions } from '../../../server/gateway';
import { createConsumerPricesServiceRoutes } from '../../../src/generated/server/startup_intelligence/consumer_prices/v1/service_server';
import { consumerPricesHandler } from '../../../server/startup/consumer-prices/v1/handler';

export default createStartupDomainGateway(
  createConsumerPricesServiceRoutes(consumerPricesHandler, serverOptions),
);
