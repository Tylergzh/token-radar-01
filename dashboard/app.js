/**
 * Token Radar - Dashboard Logic
 * This file handles data rendering, filtering, sorting, and the model recompute logic.
 */

(function() {
  'use strict';

  const DATA = window.TOKEN_RADAR;
  if (!DATA) {
    console.error('TOKEN_RADAR data not found. Ensure data.js is loaded first.');
    return;
  }

  const { board, live, meta } = DATA;

  // State
  const state = {
    view: 'pretoken', // 'pretoken' or 'live'
    search: '',
    category: '',
    chain: '',
    watchlistOnly: false,
    sortBy: 'implied_value_usd',
    sortDir: -1,
    limit: 50,
    selectedSlug: null,
  };

  // DOM Elements
  const els = {
    snapshotMeta: document.getElementById('snapshot-meta'),
    methodology: document.getElementById('methodology'),
    tileWatchlist: document.getElementById('tile-watchlist'),
    tileBoard: document.getElementById('tile-board'),
    tileEarly: document.getElementById('tile-early'),
    tileLive: document.getElementById('tile-live'),
    searchInput: document.getElementById('search-input'),
    catFilter: document.getElementById('category-filter'),
    chainFilter: document.getElementById('chain-filter'),
    wlToggle: document.getElementById('watchlist-only'),
    tabPre: document.getElementById('tab-pretoken'),
    tabLive: document.getElementById('tab-live'),
    showAllBtn: document.getElementById('show-all-btn'),
    rowCount: document.getElementById('row-count'),
    tableBody: document.getElementById('table-body'),
    formula: document.getElementById('model-formula'),
    factorsTable: document.getElementById('factors-table').querySelector('tbody'),
    calibNote: document.getElementById('calibration-note'),
    disclaimer: document.getElementById('disclaimer'),
    footerTime: document.getElementById('footer-time'),
    detailPanel: document.getElementById('detail-panel'),
    detailContent: document.getElementById('detail-content'),
    closeDetail: document.getElementById('close-detail'),
  };

  /**
   * Utility for formatting currency
   */
  function fmtUSD(val) {
    if (val >= 1e9) return `$${(val / 1e9).toFixed(2)}B`;
    if (val >= 1e6) return `$${(val / 1e6).toFixed(1)}M`;
    if (val >= 1e3) return `$${(val / 1e3).toFixed(1)}K`;
    return `$${Math.round(val)}`;
  }

  /**
   * Utility for formatting percentages
   */
  function fmtPct(val) {
    if (val === null || val === undefined) return '—';
    const sign = val > 0 ? '+' : '';
    return `${sign}${val.toFixed(2)}%`;
  }

  /**
   * Initialize Static Content & Meta
   */
  function initMeta() {
    els.snapshotMeta.textContent = `Snapshot: ${meta.as_of} | Model: radar-2`;
    els.methodology.textContent = "Implied value is a model, not a promise. Every row is scored by one formula from the snapshot's own figures — TVL, seven-day growth, age with no token, and a category factor calibrated from the live tokens that already trade.";
    els.formula.textContent = meta.formula;
    els.footerTime.textContent = `Data as of ${meta.as_of}`;
    els.calibNote.textContent = "The TVL exponent (-0.15) provides a diminishing returns damping effect, reflecting that larger protocols typically command lower valuation multiples relative to TVL.";
    els.disclaimer.textContent = "A protocol on this board records no token in DefiLlama. That is not proof it has none — a token may exist that the record does not carry. The board never predicts whether or when a token is issued.";

    // Build category factors table
    Object.entries(meta.factors).forEach(([cat, factor]) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${cat}</td><td>-</td><td>${factor.toFixed(2)}</td>`;
      els.factorsTable.appendChild(tr);
    });

    // Fill filters
    const cats = [...new Set(board.map(r => r.category))].sort();
    cats.forEach(c => {
      const opt = document.createElement('option');
      opt.value = opt.textContent = c;
      els.catFilter.appendChild(opt);
    });

    const chains = [...new Set(board.flatMap(r => r.chains))].sort();
    chains.forEach(c => {
      const opt = document.createElement('option');
      opt.value = opt.textContent = c;
      els.chainFilter.appendChild(opt);
    });
  }

  /**
   * Update Summary Tiles
   */
  function updateTiles() {
    const wlCount = board.filter(r => r.is_watchlist).length;
    els.tileWatchlist.textContent = `${wlCount}/40`;
    els.tileBoard.textContent = board.length;
    els.tileEarly.textContent = board.filter(r => !r.is_watchlist).length;
    els.tileLive.textContent = live.length;
  }

  /**
   * Filtering and Sorting Logic
   */
  function getFilteredData() {
    const source = state.view === 'pretoken' ? board : live;
    
    return source.filter(r => {
      const matchSearch = !state.search || 
        [r.name, r.slug, r.category, r.chain].some(v => String(v).toLowerCase().includes(state.search.toLowerCase()));
      const matchCat = !state.category || r.category === state.category;
      const matchChain = !state.chain || (Array.isArray(r.chains) ? r.chains.includes(state.chain) : r.chain === state.chain);
      const matchWL = !state.watchlistOnly || r.is_watchlist;
      return matchSearch && matchCat && matchChain && matchWL;
    }).sort((a, b) => {
      const valA = a[state.sortBy] ?? 0;
      const valB = b[state.sortBy] ?? 0;
      return valA > valB ? state.sortDir : (valA < valB ? -state.sortDir : 0);
    });
  }

  /**
   * Render Table
   */
  function renderTable() {
    const filtered = getFilteredData();
    const displayed = filtered.slice(0, state.limit);
    
    els.rowCount.textContent = `Showing ${displayed.length} of ${filtered.length}`;
    els.tableBody.innerHTML = '';

    displayed.forEach((r, i) => {
      const tr = document.createElement('tr');
      
      // Columns for Pre-token vs Live
      if (state.view === 'pretoken') {
        const implied = r.implied_value_usd;
        const maxImplied = Math.max(...board.map(x => x.implied_value_usd));
        const width = (implied / maxImplied * 100).toFixed(1);

        tr.innerHTML = `
          <td class="ui-monospace">${r.rank}</td>
          <td style="font-weight:600">${r.name}</td>
          <td class="ui-monospace">${fmtUSD(r.tvl_usd)}</td>
          <td class="ui-monospace ${r.change_7d < 0 ? 'text-negative' : ''}">${fmtPct(r.change_7d)}</td>
          <td class="ui-monospace">${Math.round(r.age_days)}d</td>
          <td>
            <div class="implied-cell">
              <div class="implied-bar-bg">
                <div class="implied-bar-fill" style="width: ${width}%"></div>
              </div>
              <span class="implied-val ui-monospace">${fmtUSD(implied)}</span>
            </div>
          </td>
          <td>${r.is_watchlist ? '<span class="badge badge-wl">WL</span>' : ''}</td>
        `;
      } else {
        const ratio = r.mcap_tvl_ratio;
        tr.innerHTML = `
          <td class="ui-monospace">—</td>
          <td style="font-weight:600">${r.name}</td>
          <td class="ui-monospace">${fmtUSD(r.tvl_usd)}</td>
          <td class="ui-monospace">—</td>
          <td class="ui-monospace">—</td>
          <td class="ui-monospace">${fmtUSD(r.mcap_usd)}</td>
          <td class="ui-monospace">${ratio.toFixed(2)}x</td>
        `;
      }

      tr.onclick = () => openDetail(r);
      els.tableBody.appendChild(tr);
    });
  }

    /**
   * Detail Panel Logic
   */
  function openDetail(r) {
    state.selectedSlug = r.slug;
    els.detailPanel.classList.add('open');
    
    if (state.view === 'live') {
      els.detailContent.innerHTML = `
        <h2>${r.name}</h2>
        <p class="detail-meta">${r.category} | ${r.chains.join(', ')}</p>
        <div class="detail-section">
          <h3>Market Data</h3>
          <p>Market Cap: ${fmtUSD(r.mcap_usd)}</p>
          <p>TVL: ${fmtUSD(r.tvl_usd)}</p>
          <p>Ratio: ${r.mcap_tvl_ratio.toFixed(3)}x</p>
        </div>
      `;
      return;
    }

    // Model Breakdown for Pre-token
    const tvl = r.tvl_usd;
    const change_7d = r.change_7d ?? 0;
    const age = r.age_days;
    const cat = r.category;
    const catFactor = meta.factors[cat] ?? 1.00;

    const size = Math.pow(tvl / 1_000_000_000, -0.15);
    const growth = 1 + (0.6 * Math.max(-40, Math.min(60, change_7d))) / 100;
    const maturity = 0.70 + (0.30 * Math.min(age, 1095)) / 1095;
    const implied = Math.round(tvl * 0.20 * size * growth * maturity * catFactor);

    const breakdownHtml = `
      <div class="breakdown-grid">
        <div class="breakdown-item"><span>TVL</span><span class="ui-monospace">${fmtUSD(tvl)}</span></div>
        <div class="breakdown-item"><span>Size Factor</span><span class="ui-monospace">${size.toFixed(3)}</span></div>
        <div class="breakdown-item"><span>Growth Factor</span><span class="ui-monospace">${growth.toFixed(3)}</span></div>
        <div class="breakdown-item"><span>Maturity Factor</span><span class="ui-monospace">${maturity.toFixed(3)}</span></div>
        <div class="breakdown-item"><span>Category Factor</span><span class="ui-monospace">${catFactor.toFixed(2)}</span></div>
        <div class="breakdown-item total"><span>Implied Value</span><span class="ui-monospace">${fmtUSD(implied)}</span></div>
      </div>
      <div class="verify-line ${implied === r.implied_value_usd ? 'ok' : 'err'}">
        ${implied === r.implied_value_usd ? '✓ Page recompute matches' : '✗ Value mismatch'}
      </div>
    `;

    const farmHtml = `
      <div class="farm-plan">
        <h3>Farming Plan</h3>
        ${r.farm_steps.map((step, i) => `<div class="farm-step"><strong>${i+1}.</strong> ${step}</div>`).join('')}
      </div>
    `;

    const riskNote = `
      <div class="risk-note">
        <strong>Risk Note:</strong> This protocol records no token in DefiLlama.
        ${(cat === 'CDP' || cat === 'Stablecoin') ? '<br>Note: Stablecoin protocols often have different airdrop logic.' : ''}
        ${(cat === 'Bridge' || cat === 'Canonical Bridge') ? '<br>Note: Bridge protocols may have distinct reward mechanisms.' : ''}
      </div>
    `;

    els.detailContent.innerHTML = `
      <h2>${r.name}</h2>
      <p class="detail-meta">${r.category} | ${r.chains.join(', ')}</p>
      <div class="detail-section">
        <h3>Model Breakdown</h3>
        ${breakdownHtml}
      </div>
      <div class="detail-section">
        ${farmHtml}
      </div>
      ${riskNote}
    `;
  }

  /**
   * URL Hash Sync
   */
  function syncHash() {
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    const params = new URLSearchParams(hash);
    if (params.has('q')) state.search = params.get('q');
    if (params.has('category')) state.category = params.get('category');
    if (params.has('p')) {
      state.selectedSlug = params.get('p');
      const found = board.find(r => r.slug === state.selectedSlug);
      if (found) openDetail(found);
    }
    
    // Update control values to match state
    els.searchInput.value = state.search;
    els.catFilter.value = state.category;
    els.chainFilter.value = state.chain;
    els.wlToggle.checked = state.watchlistOnly;
    if (state.view === 'live') {
      els.tabLive.classList.add('active');
      els.tabPre.classList.remove('active');
    } else {
      els.tabPre.classList.add('active');
      els.tabLive.classList.remove('active');
    }

    updateUI();
  }

  function updateHash() {
    const params = new URLSearchParams();
    if (state.search) params.set('q', state.search);
    if (state.category) params.set('category', state.category);
    if (state.selectedSlug) params.set('p', state.selectedSlug);
    const h = params.toString();
    window.history.replaceState(null, '', h ? '#' + h : ' ');
  }

  /**
   * Event Listeners
   */
  function bindEvents() {
    els.searchInput.oninput = (e) => { state.search = e.target.value; updateUI(); };
    els.catFilter.onchange = (e) => { state.category = e.target.value; updateUI(); };
    els.chainFilter.onchange = (e) => { state.chain = e.target.value; updateUI(); };
    els.wlToggle.onchange = (e) => { state.watchlistOnly = e.target.checked; updateUI(); };
    
    // Sortable headers
    const headers = document.querySelectorAll('#radar-table thead th');
    const sortKeys = ['rank', 'name', 'tvl_usd', 'change_7d', 'age_days', 'implied_value_usd'];
    headers.forEach((th, i) => {
      if (i < sortKeys.length) {
        th.style.cursor = 'pointer';
        th.onclick = () => {
          const key = sortKeys[i];
          if (state.sortBy === key) {
            state.sortDir *= -1;
          } else {
            state.sortBy = key;
            state.sortDir = -1;
          }
          updateUI();
        };
      }
    });

    els.tabPre.onclick = () => {
      state.view = 'pretoken';
      els.tabPre.classList.add('active');
      els.tabLive.classList.remove('active');
      updateUI();
    };
    els.tabLive.onclick = () => {
      state.view = 'live';
      els.tabLive.classList.add('active');
      els.tabPre.classList.remove('active');
      updateUI();
    };

    els.showAllBtn.onclick = () => {
      state.limit = 1000;
      updateUI();
    };

    els.closeDetail.onclick = () => {
      els.detailPanel.classList.remove('open');
      state.selectedSlug = null;
      updateHash();
    };
  }

  function updateUI() {
    updateTiles();
    renderTable();
    updateHash();
  }

  // Initialize
  initMeta();
  updateTiles();
  renderTable();
  bindEvents();
  syncHash();

})();

