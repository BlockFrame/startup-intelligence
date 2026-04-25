/**
 * Startup research handler composition.
 *
 * The individual RPC implementations still live in the legacy module tree for
 * now, but the startup edge surface no longer imports the worldmonitor
 * composition barrel.
 */

import type { ResearchServiceHandler } from '../../../../src/generated/server/worldmonitor/research/v1/service_server';

import { listArxivPapers } from './list-arxiv-papers';
import { listTrendingRepos } from './list-trending-repos';
import { listHackernewsItems } from './list-hackernews-items';
import { listTechEvents } from './list-tech-events';

export const researchHandler: ResearchServiceHandler = {
  listArxivPapers,
  listTrendingRepos,
  listHackernewsItems,
  listTechEvents,
};
