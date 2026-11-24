// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and renders
// the ranked board, the model that priced it, a per-protocol detail drawer with the full factor
// breakdown and the farm plan, and the live tokens set apart from the ranking. No network: every
// byte it shows is in data.js, and the page recomputes implied value from the same six factors the
// board was built with, so the number on screen is the number in board.json.
(function () {
  'use strict';

  var D = window.RADAR;
  if (!D) return;
  var M = D.model;
  var app = document.getElementById('app');
  var state = { q: '', category: 'all', chain: 'all', sort: 'rank', dir: 1, selected: null };
  var dialog = null;

  // ---------------------------------------------------------------- formatting
  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unlisted';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return days + 'd';
  }
  function fmtX(n) {
    return '×' + (Math.round(n * 1000) / 1000);
  }
  function fmtBase(n) {
    return String(Math.round(n * 10000) / 10000);
  }

  // The model, one function: recompute a row from the snapshot figures and the factors the fit
  // chose, then compare with the number board.json carries.
  function growthMultOf(r) {
    var g = Math.min(M.growth_cap, Math.max(M.growth_floor, r.change_7d === null || r.change_7d === undefined ? 0 : r.change_7d));
    return { pct: g, mult: 1 + (g / 100) * M.growth_weight };
  }
  function maturityMultOf(r) {
    var age = r.age_days === null || r.age_days === undefined ? M.unknown_age_days : r.age_days;
    return { age: age, mult: M.maturity_floor + (Math.min(Math.max(age, 0), M.maturity_days) / M.maturity_days) * M.maturity_range };
  }
  function impliedOf(r) {
    var g = growthMultOf(r).mult;
    var m = maturityMultOf(r).mult;
    var f = r.model;
    return Math.max(1, Math.round(r.tvl_usd * D.base_multiple * g * m * f.category_multiplier * f.chain_multiplier * f.size_multiplier));
  }

  // ---------------------------------------------------------------- dom helper
  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }
  function chainLabel(r) {
    if (!r.chains || r.chains.length === 0) return 'unnamed chain';
    return r.chains.slice(0, 2).join(', ') + (r.chains.length > 2 ? ' +' + (r.chains.length - 2) : '');
  }

  // ---------------------------------------------------------------- state in the hash
  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('p')) state.selected = params.get('p');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  // ---------------------------------------------------------------- filtering and sorting
  function rows() {
    var q = state.q.trim().toLowerCase();
    return D.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (!r.chains || r.chains.indexOf(state.chain) < 0)) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, r.sector, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  var NUMERIC = { implied: 1, tvl: 1, growth: 1, age: 1, rank: 1 };
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'category') { av = (a.category || '').toLowerCase(); bv = (b.category || '').toLowerCase(); }
      else if (key === 'chain') { av = (a.chains && a.chains[0] || '').toLowerCase(); bv = (b.chains && b.chains[0] || '').toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? -Infinity : a.age_days; bv = b.age_days === null ? -Infinity : b.age_days; }
      else if (key === 'implied') { av = a.implied_value_usd; bv = b.implied_value_usd; }
      else { av = a.rank; bv = b.rank; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.rank - b.rank;
    });
  }

  // ---------------------------------------------------------------- header, kpis, coverage
  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' },
        el('span', { class: 'mark', 'aria-hidden': 'true' }),
        el('div', null,
          el('h1', { text: 'Token Radar' }),
          el('small', { text: 'Pre-token protocols ranked by implied value, with a costed farm plan on every row' })
        )
      ),
      el('div', { class: 'top-meta' },
        el('span', { class: 'pill', text: 'snapshot ' + D.as_of }),
        el('span', { class: 'pill', text: 'model ' + D.model_version }),
        el('span', { class: 'pill mint', text: 'offline · no hand-picked names' })
      )
    );
  }
  function kpis() {
    var floorM = Math.round(D.floor_usd / 1e6);
    var pretoken = D.coverage.ranked + D.coverage.pretoken_offboard;
    function card(label, value, note, cls) {
      return el('div', { class: 'kpi' },
        el('div', { class: 'label', text: label }),
        el('div', { class: 'value' + (cls ? ' ' + cls : ''), text: value }),
        el('div', { class: 'note', text: note })
      );
    }
    return el('section', { class: 'kpis', 'aria-label': 'Board summary' },
      card('Watchlist covered', D.watchlist_size + ' / ' + D.watchlist_size, 'every slug the snapshot lists', 'mint'),
      card('Rows ranked', String(D.board_size), D.early_size + ' of them below the $' + floorM + 'M floor'),
      card('Live tokens', String(D.live_total), 'priced by market, set aside', 'amber'),
      card('Median implied', fmtUsd(D.median_implied_usd), 'across the ranked board'),
      card('Record no token', String(pretoken), 'pre-token protocols in the snapshot')
    );
  }
  function coverage() {
    var c = D.coverage;
    function seg(width, color, title) { return el('i', { style: 'width:' + width + '%;background:' + color, title: title }); }
    var total = c.total || 1;
    return el('section', { class: 'cover', 'aria-label': 'How the snapshot was read' },
      el('p', null,
        el('b', { text: String(c.total) }), ' protocols read — ',
        el('b', { text: String(c.ranked) }), ' ranked by the model · ',
        el('b', { text: String(c.pretoken_offboard) }), ' pre-token below the board · ',
        el('b', { text: String(c.token_recorded) }), ' already record a token (',
        el('b', { text: String(c.live_priced) }), ' with a market cap, ',
        el('b', { text: String(c.token_no_cap) }), ' without one)'
      ),
      el('div', { class: 'segbar', 'aria-hidden': 'true' },
        seg((c.ranked / total) * 100, '#34e0a1', 'ranked'),
        seg((c.pretoken_offboard / total) * 100, '#3a4658', 'pre-token off-board'),
        seg((c.live_priced / total) * 100, '#6c9cff', 'priced by market'),
        seg((c.token_no_cap / total) * 100, '#ffb454', 'token on record, no cap')
      ),
      el('div', { class: 'legend' },
        el('span', null, el('i', { style: 'background:#34e0a1' }), 'ranked by the model'),
        el('span', null, el('i', { style: 'background:#3a4658' }), 'pre-token, below the board'),
        el('span', null, el('i', { style: 'background:#6c9cff' }), 'token trades, market cap is a fact'),
        el('span', null, el('i', { style: 'background:#ffb454' }), 'token on record, no cap to show')
      )
    );
  }

  // ---------------------------------------------------------------- controls
  function options(list, current, allLabel) {
    var out = [el('option', { value: 'all', text: allLabel })];
    list.forEach(function (o) {
      out.push(el('option', { value: o.value, text: o.label, selected: o.value === current ? 'selected' : null }));
    });
    return out;
  }
  function controls(shown) {
    var catCount = {};
    var chainCount = {};
    D.rows.forEach(function (r) {
      var c = r.category || 'Other';
      catCount[c] = (catCount[c] || 0) + 1;
      (r.chains || []).forEach(function (ch) { chainCount[ch] = (chainCount[ch] || 0) + 1; });
    });
    var cats = Object.keys(catCount).sort(function (a, b) { return catCount[b] - catCount[a] || (a < b ? -1 : 1); })
      .map(function (c) { return { value: c, label: c + ' (' + catCount[c] + ')' }; });
    var chains = Object.keys(chainCount).sort(function (a, b) { return chainCount[b] - chainCount[a] || (a < b ? -1 : 1); })
      .map(function (c) { return { value: c, label: c + ' (' + chainCount[c] + ')' }; });

    var search = el('input', { type: 'search', id: 'q', placeholder: 'name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var catSel = el('select', { id: 'category', 'aria-label': 'Filter by category' }, options(cats, state.category, 'All categories'));
    catSel.addEventListener('change', function () { state.category = catSel.value; writeHash(); render(); });
    var chainSel = el('select', { id: 'chain', 'aria-label': 'Filter by chain' }, options(chains, state.chain, 'All chains'));
    chainSel.addEventListener('change', function () { state.chain = chainSel.value; writeHash(); render(); });

    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Find' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSel),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSel),
      el('button', {
        class: 'ghost', type: 'button', text: 'Reset',
        onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; writeHash(); render(); }
      }),
      el('span', { class: 'count', text: shown + ' of ' + D.board_size + ' rows' })
    );
  }

  // ---------------------------------------------------------------- the board table
  function sortTh(key, label, cls) {
    var active = state.sort === key;
    return el('th', { scope: 'col', class: cls || '' },
      el('button', {
        type: 'button',
        'aria-label': 'Sort by ' + label + (active ? (state.dir > 0 ? ', ascending' : ', descending') : ''),
        onclick: function () {
          if (state.sort === key) state.dir = -state.dir;
          else { state.sort = key; state.dir = NUMERIC[key] && key !== 'rank' ? -1 : 1; }
          render();
        }
      }, label, active ? el('span', { class: 'arrow', 'aria-hidden': 'true', text: state.dir > 0 ? '▲' : '▼' }) : null)
    );
  }
  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h3', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category or chain to see the board again.' }),
        el('button', {
          class: 'ghost', type: 'button', text: 'Clear filters',
          onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; writeHash(); render(); }
        })
      ));
    }
    var max = D.rows[0] ? Math.max.apply(null, D.rows.map(function (r) { return r.implied_value_usd; })) : 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var gClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      tbody.appendChild(el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'rank' + (r.rank <= 10 ? ' top' : ''), text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + chainLabel(r) + (r.watchlist ? ' · watchlist' : '') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + gClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('span', { class: 'chip ' + r.sector, text: r.category || 'Other' })),
        el('td', { class: 'chain-cell', text: r.chains && r.chains.length ? r.chains[0] + (r.chains.length > 1 ? ' +' + (r.chains.length - 1) : '') : '—' }),
        el('td', null, el('div', { class: 'implied' },
          el('span', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('b', { text: fmtUsd(r.implied_value_usd) })
        ))
      ));
    });
    return el('div', { class: 'panel' },
      controls(list.length),
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Pre-token protocols, rank 1 = highest implied value. Select a row for its full model breakdown and farm plan.' }),
          el('thead', null, el('tr', null,
            sortTh('rank', 'Rank'),
            sortTh('name', 'Protocol'),
            sortTh('tvl', 'TVL'),
            sortTh('growth', '7d'),
            sortTh('age', 'Age'),
            sortTh('category', 'Category'),
            sortTh('chain', 'Chain'),
            sortTh('implied', 'Implied value')
          )),
          tbody
        )
      )
    );
  }

  // ---------------------------------------------------------------- the model panel
  function factorRows() {
    var growth = '1 + clamp(7d change, ' + M.growth_floor + '%, +' + M.growth_cap + '%) × ' + M.growth_weight;
    var maturity = M.maturity_floor + ' + ' + M.maturity_range + ' × min(age, ' + M.maturity_days + 'd) ÷ ' + M.maturity_days + 'd';
    var rowsDef = [
      ['base', fmtBase(D.base_multiple), D.base_note],
      ['growth', '×0.80–1.12', growth],
      ['maturity', '×0.75–1.00', maturity],
      ['category', '×0.70–1.60', 'sector weight, blended with that category’s own live comparables when ≥5 exist'],
      ['chain', '×1.00–1.07', 'Ethereum ×' + M.chain_ethereum + ' · Base ×' + M.chain_base + ' · staking/restaking adjacency +' + M.chain_stake],
      ['size', '×0.52–1.43', 'the TVL bucket’s own median cap/TVL, shrunk toward 1 (big TVL prices cheaper)']
    ];
    return el('div', { class: 'factors' }, rowsDef.map(function (f) {
      return el('div', { class: 'factor' },
        el('span', { class: 'k', text: f[0] }),
        el('span', { class: 'v', text: f[1] }),
        el('span', { class: 'd', text: f[2] })
      );
    }));
  }
  function modelPanel() {
    var onBoard = {};
    D.rows.forEach(function (r) { onBoard[r.category || 'Other'] = true; });
    var cats = D.factors.category.filter(function (f) { return onBoard[f.category]; });
    return el('section', { class: 'panel model', 'aria-label': 'How the value is derived' },
      el('div', { class: 'live-head' }, el('h2', { text: 'How the value is derived' }), el('span', { class: 'n', text: D.model_version })),
      el('p', { class: 'lede', text: 'One function scores every row from the snapshot’s own fields. No protocol name is special-cased.' }),
      el('div', { class: 'formula' },
        'implied = round( TVL × base × growth × maturity × category × chain × size )'
      ),
      (function () {
        var demo = D.rows[0];
        return el('div', { class: 'farmcard' },
          el('div', { class: 'farmcard-k', text: 'FARM PLAN · ON EVERY ROW' }),
          el('div', { class: 'farmcard-big', text: '$' + demo.farm.capital_usd + ' ' + (demo.category || 'DEPOSIT').toUpperCase() + ' · ' + demo.farm.days + ' DAYS' }),
          el('div', { class: 'farmcard-sub', text: 'gas $' + demo.farm.gas_usd + '/tx · ' + demo.farm_steps.length + ' costed steps · ' + chainLabel(demo) })
        );
      })(),
      factorRows(),
      el('div', { class: 'subhead' }, el('h3', { text: 'Category multipliers' }), el('span', { text: 'mint = fitted on live comparables' })),
      el('div', { class: 'chips' }, cats.map(function (f) {
        return el('span', {
          class: 'mchip' + (f.comps >= M.category_min_comps ? ' fitted' : ''),
          title: f.source,
          text: f.category + ' ×' + (Math.round(f.multiplier * 100) / 100)
        });
      })),
      el('div', { class: 'subhead' }, el('h3', { text: 'Size buckets' }), el('span', { text: 'live median cap/TVL' })),
      el('div', { class: 'sizes' },
        el('div', { class: 'size-row head' }, el('span', { text: 'Bucket' }), el('span', { text: 'n' }), el('span', { text: 'Multiplier' })),
        D.factors.size.map(function (f) {
          return el('div', { class: 'size-row' },
            el('span', { text: f.bucket }),
            el('span', { class: 'n', text: String(f.comps) }),
            el('span', { class: 'm', text: '×' + (Math.round(f.multiplier * 100) / 100) })
          );
        })
      )
    );
  }

  // ---------------------------------------------------------------- live tokens
  function liveMini() {
    return el('section', { class: 'panel model', 'aria-label': 'Live tokens preview' },
      el('div', { class: 'live-head' }, el('h2', { text: 'Live tokens' }), el('span', { class: 'n', text: D.live_total + ' priced' })),
      el('p', { class: 'lede', text: 'These already trade: market cap is a fact, not a model output. They are never mixed into the pre-token ranking.' }),
      el('div', { class: 'mini' }, D.live.slice(0, 6).map(function (r) {
        return el('div', { class: 'row' },
          el('span', { text: r.name }),
          el('span', { class: 'cap', text: fmtUsd(r.mcap_usd) }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' · TVL ' + fmtUsd(r.tvl_usd) + ' · cap÷TVL ' + (r.tvl_usd > 0 && r.mcap_usd ? (Math.round((r.mcap_usd / r.tvl_usd) * 100) / 100) + '×' : 'n/a') })
        );
      }))
    );
  }
  function liveSection() {
    var tbody = el('tbody');
    D.live.forEach(function (r) {
      tbody.appendChild(el('tr', { style: 'cursor:default' },
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + chainLabel(r) })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num ratio', text: r.tvl_usd > 0 && r.mcap_usd ? (Math.round((r.mcap_usd / r.tvl_usd) * 100) / 100) + '×' : 'n/a' })
      ));
    });
    return el('section', { class: 'section', 'aria-label': 'Live tokens' },
      el('div', { class: 'head' },
        el('h2', { text: 'Live tokens · what the market already prices' }),
        el('p', { text: 'Top ' + D.live.length + ' of ' + D.live_total + ' by market cap — set apart from the ' + D.board_size + ' pre-token rows above.' })
      ),
      el('div', { class: 'panel' }, el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'A market cap on record is a fact, so these rows show the market’s own value and are never ranked by the model.' }),
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Protocol' }),
            el('th', { scope: 'col', text: 'TVL' }),
            el('th', { scope: 'col', text: '7d' }),
            el('th', { scope: 'col', text: 'Market cap' }),
            el('th', { scope: 'col', text: 'Cap ÷ TVL' })
          )),
          tbody
        )
      ))
    );
  }

  // ---------------------------------------------------------------- detail drawer
  function parseStep(s) {
    var at = s.indexOf(' Cost: ');
    var action = at >= 0 ? s.slice(0, at) : s;
    var cost = '';
    var time = '';
    if (at >= 0) {
      var tail = s.slice(at + 7);
      var t = tail.indexOf('. Time: ');
      cost = t >= 0 ? tail.slice(0, t) : tail;
      if (t >= 0) time = tail.slice(t + 8).replace(/\.$/, '');
    }
    return { action: action, cost: cost, time: time };
  }
  function categoryFactor(cat) {
    var key = cat || 'Other';
    for (var i = 0; i < D.factors.category.length; i++) if (D.factors.category[i].category === key) return D.factors.category[i];
    return null;
  }
  function sizeFactor(bucket) {
    for (var i = 0; i < D.factors.size.length; i++) if (D.factors.size[i].bucket === bucket) return D.factors.size[i];
    return null;
  }
  function openDetail(slug) {
    var row = null;
    for (var i = 0; i < D.rows.length; i++) if (D.rows[i].slug === slug) row = D.rows[i];
    if (!row || !dialog) return;
    state.selected = slug;
    writeHash();
    var m = row.model;
    var g = growthMultOf(row);
    var mt = maturityMultOf(row);
    var cat = categoryFactor(row.category);
    var size = sizeFactor(m.size_bucket);
    var hasEth = (row.chains || []).indexOf('Ethereum') >= 0;
    var hasBase = (row.chains || []).indexOf('Base') >= 0;
    var chainNote = hasEth ? 'lists Ethereum → ×' + M.chain_ethereum : hasBase ? 'lists Base, no Ethereum → ×' + M.chain_base : 'no Ethereum/Base listing → ×1.00';
    if (m.chain_multiplier > (hasEth ? M.chain_ethereum : hasBase ? M.chain_base : 1)) chainNote += ', staking adjacency +' + M.chain_stake;
    var recomputed = impliedOf(row);
    var agrees = recomputed === row.implied_value_usd;

    dialog.textContent = '';
    dialog.appendChild(el('div', { class: 'd-head' },
      el('div', { class: 'd-rank' },
        el('span', { class: 'pill mint', text: 'rank ' + row.rank + ' of ' + D.board_size }),
        el('span', { class: 'chip ' + row.sector, text: row.category || 'Other' }),
        row.watchlist ? el('span', { class: 'pill amber', text: 'watchlist' }) : null,
        el('span', { class: 'pill', text: 'pre-token record' })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close detail', text: 'Close', onclick: function () { dialog.close(); } }),
      el('h2', { id: 'detail-title', text: row.name }),
      el('div', { class: 'meta', text: chainLabel(row) + ' · TVL ' + fmtUsd(row.tvl_usd) + ' · ' + fmtAge(row.age_days) + ' with no token · 7d ' + fmtPct(row.change_7d) }),
      el('div', { class: 'd-value' },
        el('b', { text: fmtUsd(row.implied_value_usd) }),
        el('span', { text: 'implied value from one snapshot — an estimate, not a price' })
      )
    ));

    dialog.appendChild(el('section', { class: 'd-section' },
      el('h2', { text: 'How this figure is built' }),
      el('div', { class: 'break' },
        brow('TVL', 'the snapshot’s own TVL field', fmtUsd(row.tvl_usd)),
        brow('× base ' + fmtBase(D.base_multiple), D.base_note, fmtUsd(Math.round(row.tvl_usd * D.base_multiple))),
        brow('× growth ' + fmtX(g.mult), '7d ' + fmtPct(row.change_7d) + ' → clamped to ' + g.pct + '% × ' + M.growth_weight, fmtX(g.mult)),
        brow('× maturity ' + fmtX(mt.mult), mt.age + ' days with no token → ' + M.maturity_floor + ' + ' + M.maturity_range + ' × ' + mt.age + ' ÷ ' + M.maturity_days, fmtX(mt.mult)),
        brow('× category ' + fmtX(m.category_multiplier), (row.category || 'Other') + ' · sector ' + row.sector + (cat ? ' · ' + cat.source : ''), fmtX(m.category_multiplier)),
        brow('× chain ' + fmtX(m.chain_multiplier), chainNote, fmtX(m.chain_multiplier)),
        brow('× size ' + fmtX(m.size_multiplier), m.size_bucket + (size ? ' · live median cap/TVL ' + size.median_ratio + ' over ' + size.comps + ' tokens' : ''), fmtX(m.size_multiplier)),
        el('div', { class: 'brow total' },
          el('div', { class: 'k' }, 'Implied value', el('small', { text: 'round(' + fmtUsd(row.tvl_usd) + ' × the six factors above)' })),
          el('div', { class: 'v', text: fmtUsd(row.implied_value_usd) })
        )
      ),
      el('p', { class: 'recheck' },
        'Recomputed on this page: ', el('b', { text: fmtUsd(recomputed) }), agrees
          ? ' — the same number board.json carries at rank ' + row.rank + '.'
          : ' — differs from board.json (' + fmtUsd(row.implied_value_usd) + '), the data would be stale.'
      )
    ));

    var plan = row.farm;
    dialog.appendChild(el('section', { class: 'd-section' },
      el('h2', { text: 'Farm plan · ' + (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains[0] : 'its chain') }),
      el('div', { class: 'plan-meta' },
        el('span', { class: 'pill', text: 'capital $' + plan.capital_usd.toLocaleString('en-US') }),
        el('span', { class: 'pill', text: 'gas ≈ $' + plan.gas_usd + ' / tx' }),
        el('span', { class: 'pill', text: 'window ' + plan.days + ' days' }),
        el('span', { class: 'pill mint', text: row.farm_steps.length + ' steps' })
      ),
      el('ol', { class: 'steps' }, row.farm_steps.map(function (s) {
        var step = parseStep(s);
        return el('li', null,
          el('div', null,
            el('div', { class: 'txt', text: step.action }),
            el('div', { class: 'costs' },
              el('span', { text: 'cost: ' + step.cost }),
              el('span', { class: 't', text: 'time: ' + step.time })
            )
          )
        );
      }))
    ));

    dialog.appendChild(el('p', { class: 'd-note',
      text: 'Implied value is this radar’s own estimate from one DefiLlama snapshot: TVL, seven-day change and how long the protocol has run with no token. “Records no token” describes the snapshot’s record; it does not prove that no token exists. Farm plans are a checklist with costs and durations, not financial advice.'
    }));

    if (typeof dialog.showModal === 'function') { if (!dialog.open) dialog.showModal(); }
    else dialog.setAttribute('open', '');
  }
  function brow(k, note, v) {
    return el('div', { class: 'brow' },
      el('div', { class: 'k' }, k, el('small', { text: note })),
      el('div', { class: 'v', text: v })
    );
  }

  // ---------------------------------------------------------------- shell
  function foot() {
    return el('footer', { class: 'foot' },
      el('b', { text: 'Method. ' }), 'Implied value = round(TVL × base × growth × maturity × category × chain × size). ',
      'The base is this snapshot’s own median market cap ÷ TVL across its live tokens; growth is the seven-day change clamped to ',
      M.growth_floor + '%…+' + M.growth_cap + '%; maturity is the time since listing with no token on record; category and size are fitted on the snapshot’s live comparables where enough exist; chain rewards Ethereum/Base and staking adjacency. ',
      'Every figure comes from the sealed snapshot of ' + D.as_of + '. Nothing here is financial advice.'
    );
  }
  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(kpis());
    shell.appendChild(coverage());
    var grid = el('div', { class: 'grid' });
    grid.appendChild(boardTable());
    var side = el('div', { class: 'side' });
    side.appendChild(modelPanel());
    side.appendChild(liveMini());
    grid.appendChild(side);
    shell.appendChild(grid);
    shell.appendChild(liveSection());
    shell.appendChild(foot());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); var sel = document.querySelector('tr[data-selected="true"]'); if (sel) sel.setAttribute('data-selected', 'false'); });
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && dialog.open) dialog.close(); });

  readHash();
  render();
})();
