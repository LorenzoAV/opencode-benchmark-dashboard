/**
 * Registry section for the dashboard: a summary per model and the extended cell
 * table (variant, effort, tokens, cost). Refused cells show their reason.
 */

interface RegistryUsage {
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  costSource: string;
}

interface RegistryResult {
  correct: boolean;
  score: number;
  oracle?: { command: string; exit: number; durationMs: number };
  refused?: boolean;
  reason?: string;
}

interface RegistryCell {
  model: string;
  variant: string;
  effort: string;
  role: string;
  case: string;
  repetition: number;
}

interface RegistryRecord {
  runId: string;
  startedAt: string;
  cell: RegistryCell;
  result: RegistryResult;
  usage: RegistryUsage;
  latencyMs: number;
  providerFailureClass: string | null;
}

interface AxisSummary {
  key: string;
  total: number;
  correct: number;
  refused: number;
  avgLatencyMs: number;
  totalCostUsd: number;
  totalTokensIn: number;
  totalTokensOut: number;
}

interface RegistryPayload {
  records: RegistryRecord[];
  summary: { byModel: AxisSummary[]; byVariant: AxisSummary[]; byEffort: AxisSummary[] };
  skipped: number;
}

export async function loadRegistry(): Promise<RegistryPayload> {
  const response = await fetch('/api/registry');
  return await response.json() as RegistryPayload;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatCost(cost: number): string {
  return '$' + cost.toFixed(4);
}

function renderSummary(byModel: AxisSummary[]): string {
  const rows = byModel.map((entry) => {
    const score = entry.total > 0 ? Math.round((entry.correct / entry.total) * 100) : 0;
    return '<tr>' +
      '<td class="model-name">' + escapeHtml(entry.key) + '</td>' +
      '<td>' + score + '%</td>' +
      '<td>' + formatCost(entry.totalCostUsd) + '</td>' +
      '<td>' + entry.avgLatencyMs + 'ms</td>' +
      '<td>' + entry.refused + '</td>' +
      '</tr>';
  }).join('');
  return '<h3>Registry summary by model</h3>' +
    '<table class="registry-table"><thead><tr>' +
    '<th>Model</th><th>Score</th><th>Total cost</th><th>Avg latency</th><th>Refused</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table>';
}

function resultCell(record: RegistryRecord): string {
  if (record.result.refused) {
    return '<span class="registry-refused">refused: ' + escapeHtml(record.result.reason || 'unknown') + '</span>';
  }
  const pct = Math.round(record.result.score * 100);
  return (record.result.correct ? 'pass ' : 'fail ') + pct + '%';
}

function renderRecords(records: RegistryRecord[]): string {
  const rows = records.map((record) => '<tr>' +
    '<td>' + escapeHtml(record.cell.model) + '</td>' +
    '<td>' + escapeHtml(record.cell.variant) + '</td>' +
    '<td>' + escapeHtml(record.cell.effort) + '</td>' +
    '<td>' + escapeHtml(record.cell.case) + '</td>' +
    '<td>' + record.cell.repetition + '</td>' +
    '<td>' + resultCell(record) + '</td>' +
    '<td>' + record.usage.tokensIn + '</td>' +
    '<td>' + record.usage.tokensOut + '</td>' +
    '<td>' + formatCost(record.usage.costUsd) + '</td>' +
    '<td>' + record.latencyMs + 'ms</td>' +
    '</tr>').join('');
  return '<h3>Cells</h3>' +
    '<table class="registry-table"><thead><tr>' +
    '<th>Model</th><th>Variant</th><th>Effort</th><th>Case</th><th>Rep</th><th>Result</th>' +
    '<th>Tokens in</th><th>Tokens out</th><th>Cost</th><th>Latency</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table>';
}

export function renderRegistry(payload: RegistryPayload): void {
  const container = document.querySelector('.container');
  if (!container) return;
  let section = document.getElementById('registrySection');
  if (!section) {
    section = document.createElement('div');
    section.id = 'registrySection';
    container.appendChild(section);
  }
  const skipped = payload.skipped > 0
    ? '<p class="registry-skipped">Skipped malformed lines: ' + payload.skipped + '</p>'
    : '';
  section.innerHTML = '<h2>Registry</h2>' + skipped +
    renderSummary(payload.summary.byModel) + renderRecords(payload.records);
}
