import { loadRegistry, renderRegistry } from './registry-view';

interface LLMVerification {
  verifiedBy: string;
  timestamp: string;
  correct: boolean;
  score: number;
  reasoning: string;
}

interface ModelResult {
  testCase: string;
  latencyMs: number;
  correct: boolean;
  score: number;
  timestamp: string;
  output: string;
  expected: string;
  verification?: LLMVerification;
  prompt?: string;
}

interface ModelData {
  model: string;
  runs: unknown[];
  totalTests: number;
  totalPassed: number;
  totalFailed: number;
  avgLatency: number;
  accuracy: number;
  allResults: ModelResult[];
}

interface DashboardData {
  runs: unknown[];
  models: string[];
  testCases: string[];
}

let modelData: Record<string, ModelData> = {};
let models: string[] = [];
let testCases: string[] = [];

let heatmapResults: Record<string, ModelResult> = {};
let currentKey: string | null = null;

async function loadData(): Promise<void> {
  try {
    const [data, modelsData] = await Promise.all([
      fetch('/api/runs').then(r => r.json()) as Promise<DashboardData>,
      fetch('/api/models').then(r => r.json()) as Promise<Record<string, ModelData>>
    ]);
    
    modelData = modelsData;
    models = Object.keys(modelsData).sort();
    testCases = data.testCases || [];
  } catch (e) {
    console.error('Failed to load data:', e);
  }
}

function getHeatmapClass(correct: boolean, score: number): string {
  if (!correct) {
    if (score >= 0.75) return 'heatmap-fail-100';
    if (score >= 0.5) return 'heatmap-fail-75';
    if (score >= 0.25) return 'heatmap-fail-50';
    return 'heatmap-fail';
  } else {
    if (score >= 1) return 'heatmap-pass-100';
    if (score >= 0.75) return 'heatmap-pass-75';
    if (score >= 0.5) return 'heatmap-pass-50';
    return 'heatmap-pass';
  }
}

function renderHeatmap(selectedModels: string[] = []): void {
  const thead = document.getElementById('heatmapHead');
  const tbody = document.getElementById('heatmapBody');
  if (!thead || !tbody) return;

  const filteredModels = selectedModels.length > 0 ? selectedModels : models;
  
  heatmapResults = {};

  const winners: Record<string, { model: string; latencyMs: number }> = {};
  const modelWins: Record<string, number> = {};
  const modelCorrect: Record<string, number> = {};

  for (const tc of testCases) {
    let fastest: { model: string; latencyMs: number } | null = null;
    for (const m of filteredModels) {
      const result = modelData[m].allResults.find(r => r.testCase === tc);
      if (result) {
        const isCorrect = result.verification ? result.verification.correct : result.correct;
        if (isCorrect) {
          modelCorrect[m] = (modelCorrect[m] || 0) + 1;
          if (!fastest || result.latencyMs < fastest.latencyMs) {
            fastest = { model: m, latencyMs: result.latencyMs };
          }
        }
      }
    }
    if (fastest) {
      winners[tc] = fastest;
      modelWins[fastest.model] = (modelWins[fastest.model] || 0) + 1;
    }
  }
  
  thead.innerHTML = '<tr><th class="model-col">Model</th>' + 
    testCases.map(tc => '<th>' + tc + '</th>').join('') + '</tr>';
  
  tbody.innerHTML = filteredModels.map(m => {
    const data = modelData[m];
    const resultsMap: Record<string, ModelResult> = {};
    data.allResults.forEach(r => {
      resultsMap[r.testCase] = r;
      heatmapResults[m + '|' + r.testCase] = r;
    });
    
    const cells = testCases.map(tc => {
      const result = resultsMap[tc];
      if (result) {
        if (!result.output || result.output.trim() === '') {
          return '<td class="heatmap-cell heatmap-empty" data-key="' + m + '|' + tc + '">-</td>';
        }
        const isCorrect = result.verification ? result.verification.correct : result.correct;
        const finalScore = result.verification ? result.verification.score : result.score;
        const cls = getHeatmapClass(isCorrect, finalScore);
        const pct = Math.round(finalScore * 100);
        const seconds = Math.round(result.latencyMs / 1000);
        const isWinner = winners[tc]?.model === m;
        const winnerBadge = isWinner ? ' ⚡' : '';
        return '<td class="heatmap-cell ' + cls + '" data-key="' + m + '|' + tc + '">' + pct + '% (' + seconds + 's)' + winnerBadge + '</td>';
      }
      return '<td class="heatmap-cell heatmap-empty" data-key="' + m + '|' + tc + '">-</td>';
    });
    
    const totalLatency = data.allResults.reduce((sum, r) => sum + r.latencyMs, 0);
    const totalSeconds = Math.round(totalLatency / 1000);
    
    return '<tr><td class="model-name">' + m + ' <span class="win-count">(' + (modelCorrect[m] || 0) + '/' + testCases.length + ' correct, ' + (modelWins[m] || 0) + ' wins, ' + totalSeconds + 's)</span></td>' + cells.join('') + '</tr>';
  }).join('');
}

function showModal(key: string): void {
  const r = heatmapResults[key];
  if (!r) return;
  currentKey = key;
  const [model, testCase] = key.split('|');
  const modalTitle = document.getElementById('modalTitle');
  const modalBody = document.getElementById('modalBody');
  if (!modalTitle || !modalBody) return;

  modalTitle.textContent = model + ' - ' + testCase;
  const matchClass = r.correct ? 'match' : 'no-match';
  const verification = r.verification;
  const reasoning = verification?.reasoning || '';
  const verifiedBy = verification?.verifiedBy || '';
  const timestamp = verification?.timestamp || '';
  const prompt = r.prompt || '';
  
  modalBody.innerHTML = `
    ${prompt ? `
    <div class="modal-section">
      <h4>
        <button class="collapsible-toggle" data-target="promptContent" aria-expanded="false">▶ Prompt</button>
      </h4>
      <div id="promptContent" class="collapsible-content" style="display: none;">
        <pre>${escapeHtml(prompt)}</pre>
      </div>
    </div>
    ` : ''}
    <div class="modal-section ${matchClass}">
      <h4>Actual Output</h4>
      <pre>${escapeHtml(r.output || '')}</pre>
    </div>
    <div class="modal-section">
      <h4>Expected Output</h4>
      <pre>${escapeHtml(r.expected || '')}</pre>
    </div>
    ${(verifiedBy || timestamp) ? `
    <div class="modal-section">
      <h4>Verification Info</h4>
      <pre>${verifiedBy ? 'Verified by: ' + escapeHtml(verifiedBy) : ''}${timestamp ? '\nTimestamp: ' + escapeHtml(timestamp) : ''}</pre>
    </div>
    ` : ''}
    ${reasoning ? `
    <div class="modal-section">
      <h4>LLM Verification Reasoning</h4>
      <pre>${escapeHtml(reasoning)}</pre>
    </div>
    ` : ''}
  `;

  modalBody.querySelectorAll('.collapsible-toggle').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const target = e.currentTarget as HTMLButtonElement;
      const contentId = target.dataset.target;
      const content = document.getElementById(contentId);
      if (content) {
        const isExpanded = target.getAttribute('aria-expanded') === 'true';
        target.setAttribute('aria-expanded', String(!isExpanded));
        target.textContent = (isExpanded ? '▶' : '▼') + ' Prompt';
        content.style.display = isExpanded ? 'none' : 'block';
      }
    });
  });
  
  const modalOverlay = document.getElementById('modalOverlay');
  if (modalOverlay) modalOverlay.classList.add('active');
}

function closeModal(): void {
  const modalOverlay = document.getElementById('modalOverlay');
  if (modalOverlay) modalOverlay.classList.remove('active');
  currentKey = null;
}

function getAdjacentKey(key: string, direction: string): string | null {
  if (!key) return null;
  const [model, testCase] = key.split('|');
  const modelIdx = models.indexOf(model);
  const testIdx = testCases.indexOf(testCase);
  if (modelIdx === -1 || testIdx === -1) return null;

  let newModelIdx = modelIdx;
  let newTestIdx = testIdx;

  if (direction === 'left') newTestIdx--;
  else if (direction === 'right') newTestIdx++;
  else if (direction === 'up') newModelIdx--;
  else if (direction === 'down') newModelIdx++;

  if (newModelIdx < 0 || newModelIdx >= models.length) return null;
  if (newTestIdx < 0 || newTestIdx >= testCases.length) return null;

  return models[newModelIdx] + '|' + testCases[newTestIdx];
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Chart plugin to draw persistent labels for selected points
const labelPlugin = {
  id: 'pointLabels',
  afterDraw: (chart: Chart) => {
    const ctx = chart.ctx;
    const xAxis = chart.scales.x;
    const yAxis = chart.scales.y;
    
    selectedPoints.forEach(idx => {
      const point = chart.data.datasets[0].data[idx] as ScatterPoint | undefined;
      if (!point || !point.label) return;
      
      const x = xAxis.getPixelForValue(point.x);
      const y = yAxis.getPixelForValue(point.y);
      
      const label = point.label;
      ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, sans-serif';
      const textWidth = ctx.measureText(label).width;
      const padding = 6;
      const boxWidth = textWidth + padding * 2;
      const boxHeight = 20;
      const boxX = x + 12;
      const boxY = y - boxHeight / 2;
      
      ctx.save();
      ctx.fillStyle = 'rgba(107, 83, 68, 0.9)';
      ctx.beginPath();
      ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 4);
      ctx.fill();
      
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, boxX + padding, boxY + boxHeight / 2);
      ctx.restore();
    });
  }
};

interface ScatterPoint {
  x: number;
  y: number;
  label: string;
}

Chart.register(labelPlugin);

let selectedPoints = new Set<number>();
let scatterChart: Chart | null = null;

function createChart(filteredModels?: string[]): void {
  if (scatterChart) scatterChart.destroy();
  
  const ctx = document.getElementById('scatterChart') as HTMLCanvasElement;
  if (!ctx) return;
  
  const displayModels = filteredModels && filteredModels.length > 0 ? filteredModels : models;
  
  scatterChart = new Chart(ctx, {
    type: 'scatter',
    data: {
      datasets: [{
        label: 'Models',
        data: displayModels.map<ScatterPoint>(m => ({ x: modelData[m].avgLatency, y: modelData[m].accuracy, label: m })),
        backgroundColor: 'rgba(139, 115, 85, 0.7)',
        borderColor: 'rgba(107, 83, 68, 1)',
        borderWidth: 1,
        pointRadius: 8,
        pointHoverRadius: 10
      }]
    },
    options: {
      responsive: true,
      onClick: (_event: unknown, elements: { index: number }[]) => {
        if (elements.length > 0) {
          const idx = elements[0].index;
          if (selectedPoints.has(idx)) {
            selectedPoints.delete(idx);
          } else {
            selectedPoints.add(idx);
          }
          scatterChart?.draw();
        }
      },
      plugins: { 
        title: { display: true, text: 'Accuracy vs Latency' },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const raw = ctx.raw as ScatterPoint;
              const label = raw.label || raw.x;
              return label + ': ' + raw.y + '% accuracy, ' + raw.x + 'ms latency';
            }
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: 'Latency (ms)' }
        },
        y: {
          title: { display: true, text: 'Accuracy (%)' },
          min: 0,
          max: 100
        }
      }
    }
  });
}

function updateStats(data: { runs: unknown[]; models: unknown }): void {
  const totalModelsEl = document.getElementById('totalModels');
  const totalRunsEl = document.getElementById('totalRuns');
  if (totalModelsEl) totalModelsEl.textContent = String(models.length);
  if (totalRunsEl) totalRunsEl.textContent = String(data.runs.length);
}

function updateStatsFiltered(filteredModels: string[]): void {
  const totalModelsEl = document.getElementById('totalModels');
  const totalRunsEl = document.getElementById('totalRuns');
  
  if (filteredModels.length === 0) {
    if (totalModelsEl) totalModelsEl.textContent = String(models.length);
  } else {
    if (totalModelsEl) totalModelsEl.textContent = String(filteredModels.length);
  }
  
  const filteredRuns = new Set<string>();
  for (const m of filteredModels) {
    const data = modelData[m];
    if (data?.runs) {
      for (const run of data.runs) {
        filteredRuns.add((run as { runId: string }).runId);
      }
    }
  }
  if (totalRunsEl) totalRunsEl.textContent = String(filteredRuns.size);
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  // Close modal handlers
  const modalClose = document.getElementById('modalClose');
  const modalOverlay = document.getElementById('modalOverlay');
  
  modalClose?.addEventListener('click', () => closeModal());
  modalOverlay?.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });

  // Keyboard navigation
  document.addEventListener('keydown', (e) => {
    const modal = document.getElementById('modalOverlay');
    if (!modal?.classList.contains('active')) return;

    if (e.key === 'Escape') {
      closeModal();
      return;
    }

    if (currentKey) {
      if (e.key === 'ArrowLeft') {
        const newKey = getAdjacentKey(currentKey, 'left');
        if (newKey && heatmapResults[newKey]) { showModal(newKey); e.preventDefault(); }
      } else if (e.key === 'ArrowRight') {
        const newKey = getAdjacentKey(currentKey, 'right');
        if (newKey && heatmapResults[newKey]) { showModal(newKey); e.preventDefault(); }
      } else if (e.key === 'ArrowUp') {
        const newKey = getAdjacentKey(currentKey, 'up');
        if (newKey && heatmapResults[newKey]) { showModal(newKey); e.preventDefault(); }
      } else if (e.key === 'ArrowDown') {
        const newKey = getAdjacentKey(currentKey, 'down');
        if (newKey && heatmapResults[newKey]) { showModal(newKey); e.preventDefault(); }
      }
    }
  });

  // Heatmap cell click
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('heatmap-cell') && target.dataset.key) {
      showModal(target.dataset.key);
    }
  });

  // Model filter
  let selectedModels: Set<string> = new Set();

  function populateModelCheckboxList(filter = ''): void {
    const list = document.getElementById('modelCheckboxList');
    if (!list) return;
    
    const filteredModels = models.filter(m => m.toLowerCase().includes(filter.toLowerCase())).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    list.innerHTML = filteredModels.map(m => {
      const isSelected = selectedModels.has(m);
      return '<div class="model-checkbox-item' + (isSelected ? ' selected' : '') + '">' +
        '<input type="checkbox" value="' + m + '"' + (isSelected ? ' checked' : '') + ' id="model-check-' + m.replace(/[^a-zA-Z0-9]/g, '_') + '">' +
        '<label for="model-check-' + m.replace(/[^a-zA-Z0-9]/g, '_') + '">' + m + '</label>' +
        '</div>';
    }).join('');

    // Add click handlers
    list.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        if (target.checked) {
          selectedModels.add(target.value);
        } else {
          selectedModels.delete(target.value);
        }
        updateDropdownLabel();
        applyFilter();
      });
    });
  }

  function updateDropdownLabel(): void {
    const label = document.getElementById('modelDropdownLabel');
    if (!label) return;
    
    if (selectedModels.size === 0) {
      label.textContent = 'Select models...';
    } else if (selectedModels.size === 1) {
      label.textContent = Array.from(selectedModels)[0];
    } else {
      label.textContent = selectedModels.size + ' models selected';
    }
  }

  function setupModelFilter(): void {
    const trigger = document.getElementById('modelDropdownTrigger');
    const dropdown = document.getElementById('modelDropdown');
    const filterInput = document.getElementById('modelFilterInput');
    const selectAllBtn = document.getElementById('selectAllModels');
    const clearAllBtn = document.getElementById('clearAllModels');

    if (!trigger || !dropdown) return;

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('open');
      if (dropdown.classList.contains('open')) {
        filterInput?.focus();
      }
    });

    document.addEventListener('click', (e) => {
      if (!dropdown.contains(e.target as Node)) {
        dropdown.classList.remove('open');
      }
    });

    filterInput?.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement;
      populateModelCheckboxList(target.value);
    });

    selectAllBtn?.addEventListener('click', () => {
      const filterValue = filterInput ? (filterInput as HTMLInputElement).value : '';
      const filteredModels = models.filter(m => m.toLowerCase().includes(filterValue.toLowerCase()));
      filteredModels.forEach(m => selectedModels.add(m));
      populateModelCheckboxList(filterValue);
      updateDropdownLabel();
      applyFilter();
    });

    clearAllBtn?.addEventListener('click', () => {
      selectedModels.clear();
      populateModelCheckboxList(filterInput ? (filterInput as HTMLInputElement).value : '');
      updateDropdownLabel();
      applyFilter();
    });

    populateModelCheckboxList();
    updateDropdownLabel();
  }

  function applyFilter(): void {
    const selected = selectedModels.size > 0 ? Array.from(selectedModels) : [];
    renderHeatmap(selected);
    createChart(selected);
    updateStatsFiltered(selected);
  }



  // Initial render - wait for data to load first
  await loadData();
  setupModelFilter();
  createChart();
  updateStats({ runs: [], models });
  renderHeatmap();

  try {
    renderRegistry(await loadRegistry());
  } catch (e) {
    console.error('Failed to load registry:', e);
  }
});
