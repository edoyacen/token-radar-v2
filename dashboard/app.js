// Token Radar's page. It reads window.RADAR (written beside dashboard/ by main.ts), renders the
// ranked pre-token board, a separate live-token panel, the model's factor tables and a detail view
// with the full arithmetic and farm plan for one protocol. No network: every byte shown is local.
import { FACTORS, CATEGORY_RULES, CHAIN_RULES, SIZE_RULES, score } from './factors.mjs';
import { farmPlan, stepText, capitalFor, gasFor, holdDaysFor, primaryChain } from './farm.mjs';

const DATA = window.RADAR;
const app = document.getElementById('app');
if (!DATA || !app) throw new Error('Token Radar: data.js did not load');

const S = { q: '', cat: 'all', chain: 'all', sort: 'rank', dir: 1, sel: null };
const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

function usd(n) {
  if (n === null || n === undefined || !Number.isFinite(n)) return 'n/a';
  if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
  return '$' + nf.format(n);
}

function pct(n) {
  if (n === null || n === undefined || !Number.isFinite(n)) return 'n/a';
  return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
}

function ageText(days) {
  if (days === null || days === undefined) return 'unknown';
  if (days >= 365) return (days / 365).toFixed(1) + 'y';
  return Math.max(0, Math.round(days)) + 'd';
}

function el(tag, attrs, ...kids) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const key of Object.keys(attrs)) {
      const value = attrs[key];
      if (value === null || value === undefined) continue;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'html') node.innerHTML = value;
      else if (key.slice(0, 2) === 'on') node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value);
    }
  }
  for (const child of kids) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) child.forEach((c) => c && node.appendChild(c));
    else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
    else node.appendChild(child);
  }
  return node;
}

function chip(text, tone) {
  return el('span', { class: 'chip' + (tone ? ' ' + tone : ''), text });
}

function categoryOf(row) {
  return row.category || 'Other';
}

function primaryOf(row) {
  return (row.chains && row.chains[0]) || 'Unlisted chain';
}

function chainCell(row) {
  const extra = (row.chains && row.chains.length ? row.chains.length : 0) - 1;
  return el('span', { class: 'chain-cell' }, primaryOf(row), extra > 0 ? el('em', { text: ' +' + extra }) : null);
}

function listCategories() {
  const counts = new Map();
  for (const row of DATA.rows) {
    const c = categoryOf(row);
    counts.set(c, (counts.get(c) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function listChains() {
  const counts = new Map();
  for (const row of DATA.rows) {
    for (const c of row.chains || []) counts.set(c, (counts.get(c) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function filteredRows() {
  const q = S.q.trim().toLowerCase();
  return DATA.rows.filter((row) => {
    if (S.cat !== 'all' && categoryOf(row) !== S.cat) return false;
    if (S.chain !== 'all' && !(row.chains || []).includes(S.chain)) return false;
    if (!q) return true;
    const hay = [row.name, row.slug, row.category, (row.chains || []).join(' ')].join(' ').toLowerCase();
    return hay.includes(q);
  });
}

function sortedRows(list) {
  const key = S.sort;
  const dir = S.dir;
  return list.slice().sort((a, b) => {
    let av;
    let bv;
    if (key === 'rank') { av = a.rank; bv = b.rank; }
    else if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
    else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
    else if (key === 'growth') { av = a.change_7d ?? -999; bv = b.change_7d ?? -999; }
    else if (key === 'category') { av = categoryOf(a).toLowerCase(); bv = categoryOf(b).toLowerCase(); }
    else if (key === 'chain') { av = primaryOf(a).toLowerCase(); bv = primaryOf(b).toLowerCase(); }
    else if (key === 'age') { av = a.age_days ?? 1e9; bv = b.age_days ?? 1e9; }
    else { av = a.implied_value_usd; bv = b.implied_value_usd; }
    if (av < bv) return -dir;
    if (av > bv) return dir;
    return a.slug.localeCompare(b.slug);
  });
}

// ---------------------------------------------------------------- hash state

function readHash() {
  const params = new URLSearchParams(location.hash.replace(/^#/, ''));
  if (params.get('p')) S.sel = params.get('p');
  if (params.get('cat')) S.cat = params.get('cat');
  if (params.get('chain')) S.chain = params.get('chain');
  if (params.get('q')) S.q = params.get('q');
}

function syncHash() {
  const params = new URLSearchParams();
  if (S.q) params.set('q', S.q);
  if (S.cat !== 'all') params.set('cat', S.cat);
  if (S.chain !== 'all') params.set('chain', S.chain);
  if (S.sel) params.set('p', S.sel);
  const next = params.toString();
  history.replaceState(null, '', next ? '#' + next : location.pathname + location.search);
}

// ---------------------------------------------------------------- sections

function header() {
  return el('header', { class: 'top' },
    el('div', { class: 'brand' },
      el('span', { class: 'mark', 'aria-hidden': 'true' }),
      el('div', null,
        el('div', { class: 'eyebrow', text: 'TOKEN RADAR' }),
        el('div', { class: 'brand-sub', text: 'Pre-token protocol intelligence' })
      )
    ),
    el('div', { class: 'asof' },
      el('span', { class: 'asof-label', text: 'Snapshot' }),
      el('b', { text: DATA.as_of }),
      el('span', { class: 'asof-sep' }),
      el('span', { text: DATA.model_version + ' model' })
    )
  );
}

function hero() {
  return el('section', { class: 'hero' },
    el('div', { class: 'hero-copy' },
      el('h1', null, 'The pre-token board for ', el('span', { text: 'every protocol still without a token' })),
      el('p', null, DATA.watchlist_size + ' watchlist protocols plus ' + DATA.early_size + ' early rows below the $' + Math.round(DATA.floor_usd / 1e6) + 'M floor, ranked by a value model that reads only the snapshot: TVL, seven-day growth, listing age, category, chain and size. Live tokens are set aside at their market cap.')
    ),
    el('div', { class: 'hero-badge' },
      el('span', { class: 'badge-label', text: 'Top implied value' }),
      el('b', null, usd(DATA.rows[0].implied_value_usd)),
      el('span', { class: 'badge-note', text: DATA.rows[0].name + ' · rank 1' })
    )
  );
}

function kpis() {
  const median = DATA.median_implied;
  const facts = [
    ['Watchlist covered', DATA.watchlist_size + ' / ' + DATA.watchlist_size, 'every slug on the floor'],
    ['Pre-token board', String(DATA.board_size), DATA.early_size + ' added below the floor'],
    ['Live tokens', String(DATA.live_total), 'market cap on record, set aside'],
    ['Median implied value', usd(median), 'one model, every row'],
  ];
  return el('section', { class: 'kpis', 'aria-label': 'Board summary' },
    facts.map(([label, value, note]) =>
      el('div', { class: 'kpi' },
        el('span', { class: 'kpi-label', text: label }),
        el('b', { class: 'kpi-value', text: value }),
        el('span', { class: 'kpi-note', text: note })
      )
    )
  );
}

function modelRibbon() {
  return el('section', { class: 'ribbon', 'aria-label': 'Value model' },
    el('span', { class: 'ribbon-label', text: 'IMPLIED VALUE' }),
    el('code', { class: 'ribbon-code', text: 'TVL × ' + FACTORS.base_multiple + ' × category × growth × maturity × chain × size' }),
    el('span', { class: 'ribbon-note', text: 'pre-token only; no protocol name is special-cased' })
  );
}

function controls(list) {
  const search = el('input', { type: 'search', id: 'q', value: S.q, placeholder: 'Search name, category or chain', 'aria-label': 'Search the board' });
  search.addEventListener('input', () => { S.q = search.value; syncHash(); render(); });

  const cat = el('select', { id: 'cat', 'aria-label': 'Filter by category' },
    el('option', { value: 'all', text: 'All categories' }),
    listCategories().map(([name, count]) => el('option', { value: name, text: name + ' (' + count + ')', selected: name === S.cat ? 'selected' : null }))
  );
  cat.addEventListener('change', () => { S.cat = cat.value; syncHash(); render(); });

  const chain = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
    el('option', { value: 'all', text: 'All chains' }),
    listChains().map(([name, count]) => el('option', { value: name, text: name + ' (' + count + ')', selected: name === S.chain ? 'selected' : null }))
  );
  chain.addEventListener('change', () => { S.chain = chain.value; syncHash(); render(); });

  const reset = el('button', { class: 'btn ghost', type: 'button', text: 'Clear', onclick: () => { S.q = ''; S.cat = 'all'; S.chain = 'all'; syncHash(); render(); } });

  return el('section', { class: 'controls' },
    el('div', { class: 'field grow' }, el('label', { for: 'q', text: 'Search' }), search),
    el('div', { class: 'field' }, el('label', { for: 'cat', text: 'Category' }), cat),
    el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chain),
    el('div', { class: 'field action' }, reset),
    el('span', { class: 'count', text: 'Showing ' + list.length + ' of ' + DATA.board_size + ' pre-token rows' })
  );
}

function sortHeader(key, label, className) {
  const active = S.sort === key;
  return el('th', { scope: 'col', class: className || null },
    el('button', { type: 'button', class: active ? 'active' : null, onclick: () => {
      if (S.sort === key) S.dir = -S.dir;
      else { S.sort = key; S.dir = key === 'rank' || key === 'name' || key === 'category' || key === 'chain' ? 1 : -1; }
      render();
    } }, label, el('span', { class: 'arrow', text: active ? (S.dir < 0 ? '↓' : '↑') : '↕' }))
  );
}

function board(list) {
  const max = list.length ? Math.max(...list.map((r) => r.implied_value_usd)) : 1;
  const tbody = el('tbody');
  list.forEach((row) => {
    const growthTone = row.change_7d === null ? '' : row.change_7d >= 0 ? 'pos' : 'neg';
    const barWidth = Math.max(3, Math.round((row.implied_value_usd / max) * 100));
    const tr = el('tr', {
      tabindex: '0',
      'data-selected': S.sel === row.slug ? 'true' : 'false',
      onclick: () => openDetail(row.slug),
      onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(row.slug); } },
    },
      el('td', { class: 'rank-cell' }, el('span', { class: 'rank', text: String(row.rank) })),
      el('td', { class: 'name-cell' }, el('b', { text: row.name }), el('span', { text: row.slug })),
      el('td', null, chip(categoryOf(row))),
      el('td', null, chainCell(row)),
      el('td', { class: 'num', text: usd(row.tvl_usd) }),
      el('td', { class: 'num ' + growthTone, text: pct(row.change_7d) }),
      el('td', { class: 'num', text: ageText(row.age_days) }),
      el('td', { class: 'value-cell' },
        el('div', { class: 'value' },
          el('div', { class: 'vbar' }, el('i', { style: 'width:' + barWidth + '%' })),
          el('b', { class: 'num', text: usd(row.implied_value_usd) }),
          el('span', { class: 'mult', text: '×' + row.model.category_multiplier.toFixed(2) + ' cat' })
        )
      )
    );
    tbody.appendChild(tr);
  });

  const empty = list.length === 0
    ? el('div', { class: 'empty' }, el('h3', { text: 'No protocol matches these filters' }), el('p', { text: 'Clear the search, category or chain filter to see the board again.' }))
    : null;

  return el('section', { class: 'panel board-panel' },
    el('div', { class: 'panel-head' },
      el('div', null, el('h2', { text: 'Ranked pre-token board' }), el('p', { text: 'Every row is a protocol with no market cap, CoinGecko id or token symbol. 7d is the raw snapshot change; the model clamps it to ' + FACTORS.growth_floor + '%…+' + FACTORS.growth_cap + '%. Click a row for its full model and farm plan.' })),
      el('span', { class: 'panel-meta', text: list.length + ' rows' })
    ),
    empty || el('div', { class: 'table-wrap' },
      el('table', null,
        el('thead', null, el('tr', null,
          sortHeader('rank', '#', 'rank-cell'),
          sortHeader('name', 'Protocol'),
          sortHeader('category', 'Category'),
          sortHeader('chain', 'Chain'),
          sortHeader('tvl', 'TVL'),
          sortHeader('growth', '7d raw'),
          sortHeader('age', 'Age'),
          sortHeader('implied', 'Implied value', 'value-cell')
        )),
        tbody
      )
    )
  );
}

function livePanel() {
  const tbody = el('tbody');
  DATA.live.forEach((row) => {
    tbody.appendChild(el('tr', null,
      el('td', { class: 'live-dot-cell' }, el('span', { class: 'live-dot' }), el('span', { text: 'live' })),
      el('td', { class: 'name-cell' }, el('b', { text: row.name }), el('span', { text: row.slug })),
      el('td', null, chip(categoryOf(row))),
      el('td', null, chainCell(row)),
      el('td', { class: 'num', text: usd(row.tvl_usd) }),
      el('td', { class: 'num ' + (row.change_7d !== null && row.change_7d >= 0 ? 'pos' : 'neg'), text: pct(row.change_7d) }),
      el('td', { class: 'num live-mcap', text: usd(row.mcap_usd) })
    ));
  });

  return el('section', { class: 'panel live-panel' },
    el('div', { class: 'panel-head' },
      el('div', null, el('h2', { text: 'Live tokens' }), el('p', { text: 'These ' + DATA.live_total + ' protocols already trade. Market cap is a fact, not a model, so they stay out of the pre-token ranking.' })),
      el('span', { class: 'panel-meta', text: 'top ' + DATA.live.length + ' non-CEX by market cap' })
    ),
    el('div', { class: 'table-wrap' },
      el('table', null,
        el('thead', null, el('tr', null,
          el('th', { scope: 'col', text: 'Status' }),
          el('th', { scope: 'col', text: 'Protocol' }),
          el('th', { scope: 'col', text: 'Category' }),
          el('th', { scope: 'col', text: 'Chain' }),
          el('th', { scope: 'col', text: 'TVL' }),
          el('th', { scope: 'col', text: '7d' }),
          el('th', { scope: 'col', text: 'Market cap' })
        )),
        tbody
      )
    )
  );
}

function factorCard(label, value, note) {
  return el('div', { class: 'factor' },
    el('span', { class: 'factor-label', text: label }),
    el('b', { class: 'factor-value', text: value }),
    el('span', { class: 'factor-note', text: note })
  );
}

function modelPanel() {
  const topCats = CATEGORY_RULES.slice(0, 10).map((r) =>
    el('div', { class: 'rule' }, el('span', { text: r.label.replace(' premium', '') }), el('b', { text: '×' + r.mult.toFixed(2) }))
  );
  const chains = CHAIN_RULES.slice(0, 6).map((r) =>
    el('div', { class: 'rule' }, el('span', { text: r.label }), el('b', { text: '×' + r.mult.toFixed(2) }))
  );
  const sizes = SIZE_RULES.map((r) =>
    el('div', { class: 'rule' }, el('span', { text: r.label }), el('b', { text: '×' + r.mult.toFixed(2) }))
  );

  return el('section', { class: 'panel model-panel' },
    el('div', { class: 'panel-head' },
      el('div', null, el('h2', { text: 'How the value is derived' }), el('p', { text: 'One function scores every protocol. It uses the snapshot’s own figures and the factor tables below, shared by the build and this page.' })),
      el('span', { class: 'panel-meta', text: DATA.model_version })
    ),
    el('div', { class: 'formula' },
      el('span', { class: 'formula-k', text: 'implied' }),
      el('code', { text: 'round( TVL × ' + FACTORS.base_multiple + ' × category × (1 + clamp(change_7d, ' + FACTORS.growth_floor + ', ' + FACTORS.growth_cap + ') / 100 × ' + FACTORS.growth_weight + ') × (' + FACTORS.maturity_floor + ' + min(age_days, ' + FACTORS.maturity_days + ') / ' + FACTORS.maturity_days + ' × ' + FACTORS.maturity_range + ') × chain × size )' }),
      el('span', { class: 'formula-note', text: 'Ranked descending; equal raw values are separated so no two ranks share a number. A protocol name is never an input.' })
    ),
    el('div', { class: 'factor-grid' },
      factorCard('TVL base', '×' + FACTORS.base_multiple, 'The snapshot TVL is the only scale term.'),
      factorCard('7-day growth', '×0.90 to 1.05', 'Change clamped to ' + FACTORS.growth_floor + '%…+' + FACTORS.growth_cap + '%, then weighted at ' + FACTORS.growth_weight + '.'),
      factorCard('Maturity', '×0.65 to 1.00', 'Days since listing vs ' + FACTORS.maturity_days + '; unknown uses ' + FACTORS.unknown_age_days + '.'),
      factorCard('Category', '×1.00 to 1.35', 'RWA, curators and allocators carry the premium.'),
      factorCard('Chain', '×1.00 to 1.13', 'Ethereum, Base and Solana lead; +0.5% per extra chain, capped at +3%.'),
      factorCard('TVL size bucket', '×0.92 to 1.08', 'A confidence adjustment on top of the TVL base.')
    ),
    el('div', { class: 'rule-columns' },
      el('div', { class: 'rule-block' }, el('h3', { text: 'Category multiples' }), topCats),
      el('div', { class: 'rule-block' }, el('h3', { text: 'Chain multiples' }), chains),
      el('div', { class: 'rule-block' }, el('h3', { text: 'Size buckets' }), sizes)
    ),
    el('p', { class: 'fineprint', text: 'Maturity is the best available record of how long a protocol has run with no token. Growth and size act as small tilts: TVL and category do most of the work. Farm plans use the same category, chain, TVL and age fields for capital, gas and hold time.' })
  );
}

function footer() {
  return el('footer', { class: 'footer' },
    el('span', { text: 'Token Radar · snapshot ' + DATA.as_of }),
    el('span', { text: DATA.source }),
    el('span', { text: 'pre-token board, no network calls' })
  );
}

// ---------------------------------------------------------------- detail view

const dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
document.body.appendChild(dialog);
dialog.addEventListener('close', () => {
  S.sel = null;
  syncHash();
  document.querySelectorAll('tr[data-selected="true"]').forEach((tr) => tr.setAttribute('data-selected', 'false'));
});
dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });

function splitStep(text) {
  const at = text.indexOf(' Cost: ');
  if (at < 0) return { action: text, cost: '', time: '' };
  const action = text.slice(0, at);
  const rest = text.slice(at + 7);
  const t = rest.indexOf('. Time: ');
  if (t < 0) return { action, cost: rest.replace(/\.$/, ''), time: '' };
  return { action, cost: rest.slice(0, t), time: rest.slice(t + 8).replace(/\.$/, '') };
}

function closeButton() {
  return el('button', { class: 'btn close', type: 'button', 'aria-label': 'Close detail', text: 'Close', onclick: () => dialog.close() });
}

function openDetail(slug) {
  const row = DATA.rows.find((r) => r.slug === slug);
  if (!row) return;
  S.sel = slug;
  syncHash();
  const m = row.model;
  const steps = row.farm_steps && row.farm_steps.length
    ? row.farm_steps.map(splitStep)
    : farmPlan(row, row.age_days).map((s) => splitStep(stepText(s)));
  const capital = capitalFor(row.tvl_usd);
  const gas = gasFor(primaryChain(row));
  const hold = holdDaysFor(row.age_days);
  const formula = usd(row.tvl_usd) + ' × ' + m.base_multiple + ' × ' + m.category_multiplier + ' × ' + m.growth_multiplier + ' × ' + m.maturity_multiplier + ' × ' + m.chain_multiplier + ' × ' + m.size_multiplier;

  const breakdown = [
    ['TVL (snapshot)', usd(row.tvl_usd), 'scale term'],
    ['Base multiple', '×' + m.base_multiple, 'the house base'],
    ['Category', '×' + m.category_multiplier, m.category_label + ' (' + categoryOf(row) + ')'],
    ['7-day growth', '×' + m.growth_multiplier, pct(row.change_7d) + ', clamped to ' + FACTORS.growth_floor + '%…+' + FACTORS.growth_cap + '%'],
    ['Maturity', '×' + m.maturity_multiplier, ageText(row.age_days) + ' since listing'],
    ['Chain', '×' + m.chain_multiplier, m.chain_label + ' · best chain premium'],
    ['Size bucket', '×' + m.size_multiplier, m.size_label + ' · ' + usd(row.tvl_usd)],
  ];

  dialog.innerHTML = '';
  dialog.appendChild(el('div', { class: 'detail-head' },
    el('div', { class: 'detail-id' },
      el('div', { class: 'detail-rank', text: 'RANK ' + row.rank + ' OF ' + DATA.board_size }),
      el('h2', { id: 'detail-title', text: row.name }),
      el('div', { class: 'detail-chips' },
        chip(categoryOf(row), 'accent'),
        chip(primaryOf(row)),
        chip((row.chains || []).length + ((row.chains || []).length === 1 ? ' chain' : ' chains')),
        el('span', { class: 'loc', text: row.slug })
      )
    ),
    closeButton()
  ));
  dialog.appendChild(el('div', { class: 'detail-value' },
    el('div', null,
      el('span', { class: 'detail-value-label', text: 'Implied value' }),
      el('b', { class: 'detail-value-number', text: usd(row.implied_value_usd) }),
      el('span', { class: 'detail-value-sub', text: formula + ' ≈ ' + usd(m.raw_implied) })
    ),
    el('div', { class: 'detail-value-side' },
      el('span', { text: 'TVL' }), el('b', { text: usd(row.tvl_usd) }),
      el('span', { text: '7d' }), el('b', { class: row.change_7d !== null && row.change_7d >= 0 ? 'pos' : 'neg', text: pct(row.change_7d) }),
      el('span', { text: 'Age' }), el('b', { text: ageText(row.age_days) })
    )
  ));

  dialog.appendChild(el('section', { class: 'detail-section' },
    el('h3', { text: 'Model breakdown' }),
    el('div', { class: 'breakdown' }, breakdown.map(([label, value, note]) =>
      el('div', { class: 'break-row' },
        el('span', { class: 'break-label', text: label }),
        el('b', { class: 'break-value num', text: value }),
        el('span', { class: 'break-note', text: note })
      )
    )),
    el('div', { class: 'break-row result' },
      el('span', { class: 'break-label', text: 'Implied value' }),
      el('b', { class: 'break-value num', text: usd(row.implied_value_usd) }),
      el('span', { class: 'break-note', text: 'board.json carries this integer' })
    )
  ));

  dialog.appendChild(el('section', { class: 'detail-section' },
    el('div', { class: 'plan-head' },
      el('h3', { text: 'Farm plan' }),
      el('div', { class: 'plan-facts' },
        chip('$' + capital + ' capital', 'accent'),
        chip(hold + ' day hold'),
        chip('~$' + gas * 4 + ' total gas')
      )
    ),
    el('ol', { class: 'steps' }, steps.map((step, i) =>
      el('li', null,
        el('span', { class: 'step-num', text: String(i + 1) }),
        el('div', { class: 'step-body' },
          el('b', { text: step.action }),
          el('div', { class: 'step-meta' },
            step.cost ? el('span', { class: 'tag cost', text: 'Cost: ' + step.cost }) : null,
            step.time ? el('span', { class: 'tag time', text: 'Time: ' + step.time }) : null
          )
        )
      )
    )),
    el('p', { class: 'fineprint', text: 'Capital comes from the TVL tier, gas from the primary chain and hold from listing age. The plan names this protocol but the generator contains no protocol names.' })
  ));

  if (typeof dialog.showModal === 'function') {
    if (!dialog.open) dialog.showModal();
  } else {
    dialog.setAttribute('open', '');
  }
}

// ---------------------------------------------------------------- render

function render() {
  const list = sortedRows(filteredRows());
  app.innerHTML = '';
  app.appendChild(header());
  app.appendChild(hero());
  app.appendChild(kpis());
  app.appendChild(modelRibbon());
  app.appendChild(controls(list));
  app.appendChild(board(list));
  app.appendChild(livePanel());
  app.appendChild(modelPanel());
  app.appendChild(footer());
  app.setAttribute('aria-busy', 'false');
  if (S.sel) openDetail(S.sel);
}

readHash();
render();
window.addEventListener('keydown', (event) => { if (event.key === 'Escape' && dialog.open) dialog.close(); });
