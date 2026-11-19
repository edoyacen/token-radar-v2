// The value model, shared byte for byte by the build (lib/model.ts) and the page (app.js).
// Every multiplier is a function of figures the snapshot already carries: TVL, seven-day change,
// listing age, category text, chain names and a TVL size bucket. No protocol name appears here.

export const FACTORS = {
  base_multiple: 0.22,
  growth_weight: 0.4,
  growth_floor: -25,
  growth_cap: 12,
  maturity_floor: 0.65,
  maturity_range: 0.35,
  maturity_days: 730,
  unknown_age_days: 365,
};

// Category premium: ordered, first match wins. RWA and allocators command the highest multiples;
// generic infrastructure stays at 1.00 so the model cannot inflate an unremarkable protocol.
export const CATEGORY_RULES = [
  { match: 'rwa', mult: 1.35, label: 'RWA premium' },
  { match: 'risk curator', mult: 1.32, label: 'Curator premium' },
  { match: 'onchain capital allocator', mult: 1.28, label: 'Allocator premium' },
  { match: 'restaking', mult: 1.22, label: 'Restaking premium' },
  { match: 'collateral market', mult: 1.18, label: 'Collateral premium' },
  { match: 'lending', mult: 1.18, label: 'Lending premium' },
  { match: 'cdp', mult: 1.16, label: 'CDP premium' },
  { match: 'stablecoin', mult: 1.14, label: 'Stablecoin premium' },
  { match: 'chain', mult: 1.12, label: 'Chain premium' },
  { match: 'dex', mult: 1.1, label: 'DEX premium' },
  { match: 'yield aggregator', mult: 1.09, label: 'Yield premium' },
  { match: 'yield', mult: 1.08, label: 'Yield premium' },
  { match: 'basis trading', mult: 1.07, label: 'Basis premium' },
  { match: 'derivative', mult: 1.06, label: 'Derivatives premium' },
  { match: 'perpetual', mult: 1.06, label: 'Derivatives premium' },
  { match: 'bridge', mult: 1.05, label: 'Bridge premium' },
  { match: 'staking pool', mult: 1.04, label: 'Staking premium' },
  { match: 'insurance', mult: 1.03, label: 'Insurance premium' },
  { match: 'payment', mult: 1.02, label: 'Payments premium' },
  { match: 'governance', mult: 1.01, label: 'Governance premium' },
  { match: 'cefi', mult: 1.01, label: 'CeDeFi premium' },
];

// Chain premium: Ethereum and Base carry the strongest liquidity/restaking adjacency; a small
// diversity bonus rewards protocols that actually run on several chains.
export const CHAIN_RULES = [
  { match: 'Ethereum', mult: 1.1, label: 'Ethereum' },
  { match: 'Base', mult: 1.07, label: 'Base' },
  { match: 'Solana', mult: 1.05, label: 'Solana' },
  { match: 'Arbitrum', mult: 1.04, label: 'Arbitrum' },
  { match: 'Binance', mult: 1.04, label: 'BNB Chain' },
  { match: 'Bitcoin', mult: 1.03, label: 'Bitcoin' },
  { match: 'Optimism', mult: 1.03, label: 'Optimism' },
  { match: 'Polygon', mult: 1.02, label: 'Polygon' },
  { match: 'Avalanche', mult: 1.02, label: 'Avalanche' },
  { match: 'Hyperliquid L1', mult: 1.02, label: 'Hyperliquid' },
];

// TVL size bucket: a confidence adjustment, not a second TVL term. Bigger books are easier to
// underwrite, micro caps carry a discount.
export const SIZE_RULES = [
  { min: 3e9, mult: 1.08, label: 'Mega TVL' },
  { min: 1e9, mult: 1.06, label: 'Large TVL' },
  { min: 250e6, mult: 1.03, label: 'Mid TVL' },
  { min: 50e6, mult: 1.0, label: 'Floor TVL' },
  { min: 10e6, mult: 0.96, label: 'Small TVL' },
  { min: 0, mult: 0.92, label: 'Micro TVL' },
];

export function growthFactor(change) {
  const raw = typeof change === 'number' && Number.isFinite(change) ? change : 0;
  const pct = Math.min(FACTORS.growth_cap, Math.max(FACTORS.growth_floor, raw));
  return { pct, mult: 1 + (pct / 100) * FACTORS.growth_weight };
}

export function maturityFactor(age) {
  const days = typeof age === 'number' && Number.isFinite(age) ? age : FACTORS.unknown_age_days;
  const capped = Math.min(Math.max(days, 0), FACTORS.maturity_days);
  return { mult: FACTORS.maturity_floor + (capped / FACTORS.maturity_days) * FACTORS.maturity_range };
}

export function categoryFactor(category) {
  const c = (category || '').toLowerCase();
  for (const rule of CATEGORY_RULES) if (c.indexOf(rule.match) >= 0) return rule;
  return { match: '', mult: 1, label: 'Baseline' };
}

export function chainFactor(chains) {
  const list = Array.isArray(chains) ? chains.filter((c) => typeof c === 'string' && c.length > 0) : [];
  let best = { match: '', mult: 1, label: 'Unlisted chain' };
  for (const rule of CHAIN_RULES) {
    if (list.indexOf(rule.match) >= 0 && rule.mult > best.mult) best = rule;
  }
  const extra = Math.max(0, list.length - 1);
  const bonus = Math.min(0.03, extra * 0.005);
  return {
    mult: Math.min(1.13, best.mult + bonus),
    label: best.mult > 1 ? best.label + (extra > 0 ? ' +' + extra : '') : list[0] || 'Unlisted chain',
    primary: list[0] || 'Unlisted chain',
    count: list.length,
  };
}

export function sizeFactor(tvl) {
  for (const rule of SIZE_RULES) if (tvl >= rule.min) return rule;
  return SIZE_RULES[SIZE_RULES.length - 1];
}

// One scored row: every factor and the unrounded value. Age arrives from the caller because the
// snapshot stores a listing date, not a day count.
export function score(protocol, age) {
  const growth = growthFactor(protocol.change_7d);
  const maturity = maturityFactor(age);
  const category = categoryFactor(protocol.category);
  const chain = chainFactor(protocol.chains);
  const size = sizeFactor(protocol.tvl_usd);
  const raw =
    protocol.tvl_usd *
    FACTORS.base_multiple *
    growth.mult *
    maturity.mult *
    category.mult *
    chain.mult *
    size.mult;
  return { raw, growth, maturity, category, chain, size };
}
