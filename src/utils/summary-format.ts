import { escapeHtml } from './sanitize';

function formatInline(text: string): string {
  const escaped = escapeHtml(text.trim());
  return escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

function normalizeSummary(raw: string): string[] {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/(?:^|\n)(Thesis|Why now|Evidence|Investor action|Key signal|Why it matters|Watchlist|Confidence|Next step):/g, '\n**$1:**')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
}

export function renderFormattedSummary(raw: string): string {
  const blocks = normalizeSummary(raw);
  if (blocks.length === 0) return '';

  return blocks.map((block) => {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
    const bulletLines = lines.filter((line) => /^[-*]\s+/.test(line));
    const leadLines = lines.filter((line) => !/^[-*]\s+/.test(line));
    if (bulletLines.length > 0) {
      const leadHtml = leadLines.length
        ? leadLines.map((line) => `<p>${formatInline(line)}</p>`).join('')
        : '';
      const listHtml = `<ul class="formatted-summary-list">${bulletLines
        .map((line) => `<li>${formatInline(line.replace(/^[-*]\s+/, ''))}</li>`)
        .join('')}</ul>`;
      return `${leadHtml}${listHtml}`;
    }
    return `<p>${formatInline(lines.join(' '))}</p>`;
  }).join('');
}
