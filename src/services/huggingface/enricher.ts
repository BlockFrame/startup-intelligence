import sourceConfig from '@/config/huggingface-sources.json';
import type { HuggingFaceEnrichedItem, HuggingFaceEntityType, HuggingFaceItemRole, HuggingFaceRawItem, HuggingFaceRecord, HuggingFaceThemeTag } from '@/types/huggingface';

function daysSince(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 86_400_000)) : 9999;
}

function normalizeTag(tag: string): string {
  return tag.toLowerCase().trim().replace(/\s+/g, '-');
}

function includesAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term.toLowerCase()));
}

function tagsFromRules<T extends string>(text: string, rules: Record<string, string[]>): T[] {
  return Object.entries(rules).filter(([, terms]) => includesAny(text, terms)).map(([tag]) => tag as T);
}

function uniq<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function pickId(raw: HuggingFaceRawItem): string {
  return raw.id || raw.modelId || raw.datasetId || raw.spaceId || raw.slug || raw._id || raw.name || '';
}

function urlFor(entityType: HuggingFaceEntityType, id: string, rawUrl?: string): string {
  if (rawUrl) return rawUrl;
  const prefix = entityType === 'datasets' ? 'datasets/' : entityType === 'spaces' ? 'spaces/' : entityType === 'papers' ? 'papers/' : entityType === 'collections' ? 'collections/' : '';
  return `https://huggingface.co/${prefix}${id}`;
}

export function normalizeHuggingFaceItem(raw: HuggingFaceRawItem, entityType: HuggingFaceEntityType): HuggingFaceRecord {
  const id = pickId(raw);
  const title = raw.title || raw.name || id.split('/').pop() || id;
  const owner = raw.owner || raw.author || id.split('/')[0] || '';
  const tags = uniq([...(raw.tags || []), ...(raw.cardData?.tags || [])].map(normalizeTag).filter(Boolean));
  const createdAt = raw.createdAt || raw.created_at || raw.lastModified || raw.last_modified || raw.updatedAt || raw.updated_at || new Date().toISOString();
  const updatedAt = raw.lastModified || raw.last_modified || raw.updatedAt || raw.updated_at || raw.createdAt || raw.created_at || new Date().toISOString();
  return {
    id,
    title,
    owner,
    url: urlFor(entityType, id, raw.url),
    entityType,
    tags,
    likes: raw.likes || 0,
    downloads: raw.downloads || 0,
    createdAt,
    updatedAt,
    summary: raw.summary || raw.description || raw.cardData?.description || '',
    taskType: raw.task || raw.pipeline_tag || raw.cardData?.pipeline_tag || '',
    pipelineTag: raw.pipeline_tag || raw.cardData?.pipeline_tag || '',
    ageDays: daysSince(createdAt),
    updatedDays: daysSince(updatedAt),
  };
}

export function dedupeHuggingFaceItems(items: HuggingFaceRecord[]): HuggingFaceRecord[] {
  const map = new Map<string, HuggingFaceRecord>();
  for (const item of items) {
    const key = `${item.entityType}:${item.id.toLowerCase()}`;
    const existing = map.get(key);
    if (!existing || item.likes + item.downloads > existing.likes + existing.downloads || new Date(item.updatedAt) > new Date(existing.updatedAt)) map.set(key, item);
  }
  return Array.from(map.values());
}

export function enrichHuggingFaceItem(item: HuggingFaceRecord): HuggingFaceEnrichedItem {
  const text = `${item.id} ${item.title} ${item.summary} ${item.tags.join(' ')} ${item.taskType} ${item.pipelineTag}`.toLowerCase();
  const themeTags = uniq(tagsFromRules<HuggingFaceThemeTag>(text, sourceConfig.themeRules));
  const roles = uniq([
    item.entityType === 'models' ? 'model' as const : item.entityType === 'datasets' ? 'dataset' as const : item.entityType === 'spaces' ? 'demo_space' as const : item.entityType === 'papers' ? 'paper' as const : 'collection' as const,
    ...tagsFromRules<HuggingFaceItemRole>(text, sourceConfig.roleRules),
  ]);
  const hasLeaderboard = text.includes('leaderboard') || roles.includes('leaderboard_space');
  const hasDemo = item.entityType === 'spaces' || roles.includes('demo_space') || /\bdemo\b|gradio|playground/i.test(text);
  const hasPaper = item.entityType === 'papers' || /\barxiv\b|\bpaper\b|publication/i.test(text);
  const hasDataset = item.entityType === 'datasets' || /\bdataset\b|corpus/i.test(text);
  const hasViewer = item.entityType === 'datasets' || text.includes('viewer');
  const relevanceScore = Math.min(100, themeTags.length * 12 + roles.length * 8);
  const freshnessScore = item.updatedDays <= 7 ? 100 : item.updatedDays <= 30 ? 82 : item.updatedDays <= 90 ? 58 : item.updatedDays <= 365 ? 30 : 10;
  const popularityScore = Math.min(100, Math.log10(item.likes * 8 + item.downloads + 10) * 18);
  const utilityScore = Math.min(100, (hasDemo ? 20 : 0) + (hasPaper ? 18 : 0) + (hasDataset ? 18 : 0) + (hasLeaderboard ? 24 : 0) + (hasViewer ? 12 : 0) + (roles.includes('embedding_model') || roles.includes('reranker') ? 16 : 0));
  const curationScore = item.entityType === 'collections' ? 80 : item.tags.includes('leaderboard') || item.tags.includes('benchmark') ? 58 : 35;
  const finalScore = Math.min(100, Math.round(relevanceScore * 0.35 + freshnessScore * 0.2 + popularityScore * 0.2 + utilityScore * 0.15 + curationScore * 0.1));
  return { ...item, themeTags, roles, hasDemo, hasPaper, hasDataset, hasLeaderboard, hasViewer, relevanceScore, freshnessScore, popularityScore, utilityScore, curationScore, finalScore };
}
