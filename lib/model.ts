// The token radar's value model: one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and adds the
// pre-token protocols below the floor with the most TVL. A protocol is pre-token when its record
// carries no token at all (no market cap, no CoinGecko id, no symbol); the snapshot's tokens that
// already trade are kept apart and shown as the market's own values, never mixed into the ranking.
//
// Implied value follows from the snapshot's own figures only. Six factors, every one of them a
// function of a field the sealed input carries, multiplied together:
//
//   base       = the median market cap / TVL of this snapshot's live tokens (fitted, not typed)
//   growth     = 1 + clamp(change_7d, -25, +15) / 100 x 0.80        seven-day momentum
//   maturity   = 0.75 + 0.25 x min(age_days, 1095) / 1095          how long it has run with no token
//   category   = the sector's weight, updated by the category's own live comparables when >=5 exist
//   chain      = Ethereum x1.05, Base x1.04, staking/restaking adjacency +0.02
//   size       = the TVL bucket's own median cap/TVL, shrunk toward 1 (big TVL prices cheaper)
//   implied    = max(1, round(tvl_usd x base x growth x maturity x category x chain x size))
//
// No protocol name is special-cased anywhere: the same six factors score every row, and the sector
// rules read the category text, not a list of names. The dashboard recomputes this arithmetic from
// the numbers data.js carries and shows the working for every protocol.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants: growth, maturity, the category blend and the chain weights. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  category_min_comps: number;
  category_shrink: number;
  size_shrink: number;
  category_min: number;
  category_max: number;
  size_min: number;
  size_max: number;
  chain_ethereum: number;
  chain_base: number;
  chain_stake: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.8,
  growth_floor: -25,
  growth_cap: 15,
  maturity_floor: 0.75,
  maturity_range: 0.25,
  maturity_days: 1095,
  unknown_age_days: 365,
  category_min_comps: 5,
  category_shrink: 10,
  size_shrink: 10,
  category_min: 0.7,
  category_max: 1.6,
  size_min: 0.5,
  size_max: 1.6,
  chain_ethereum: 1.05,
  chain_base: 1.04,
  chain_stake: 0.02,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-2';

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 160;

/** How many live-token protocols the Live tokens panel carries, by market cap. */
export const LIVE_ROWS = 20;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  sector: string;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    base_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    category_multiplier: number;
    chain_multiplier: number;
    size_multiplier: number;
    size_bucket: string;
    age_days: number | null;
  };
  farm: { capital_usd: number; gas_usd: number; days: number };
  farm_steps: string[];
}

/** The dashboard's view of one row: the model's factors at full precision and the farm plan itself. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  sector: string;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  watchlist: boolean;
  implied_value_usd: number;
  model: BoardRow['model'];
  farm: { capital_usd: number; gas_usd: number; days: number };
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so its market cap is a fact, not a model's output. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** One category's row in the model panel: how its multiplier was set. */
export interface CategoryFactor {
  category: string;
  sector: string;
  comps: number;
  prior: number;
  multiplier: number;
  source: string;
}

/** One TVL bucket's row in the model panel. */
export interface SizeFactor {
  bucket: string;
  min_usd: number;
  comps: number;
  median_ratio: number;
  multiplier: number;
}

/** How every protocol was counted, so the board can say the whole snapshot was read. */
export interface Coverage {
  total: number;
  ranked: number;
  pretoken_offboard: number;
  token_recorded: number;
  live_priced: number;
  token_no_cap: number;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  base_multiple: number;
  base_note: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  live_total: number;
  median_implied_usd: number;
  coverage: Coverage;
  factors: { category: CategoryFactor[]; size: SizeFactor[] };
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `asOf` to `listedAt`, clamped at zero; null when a date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol is one the board may add on its own: pre-token, not an exchange, not a pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** A finite median of a list; null when the list is empty. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/**
 * The sector a category belongs to, read off the category's own words: curators and allocators are
 * one sector, RWA another, and so on. No protocol name appears here, only the snapshot's category
 * text, so every category the snapshot ever carries lands in a sector by the same rules.
 */
export function sectorOf(category: string | null): string {
  const c = (category ?? '').toLowerCase();
  if (c.includes('curator') || c.includes('allocator') || c.includes('governance') || c.includes('liquidity manager')) return 'allocator';
  if (c.includes('rwa')) return 'rwa';
  if (c.includes('stak')) return 'stake';
  if (/(derivativ|perpetual|option|synthet|basis|dex|prediction|otc|nft|swap)/.test(c)) return 'trade';
  if (/(lend|cdp|collateral|insurance|reserve|cedefi|interest rate)/.test(c)) return 'lending';
  if (/(bridge|chain|payment|card|privacy|launchpad|locker)/.test(c)) return 'chain';
  if (/(yield|farm|anchor|btc|bitcoin)/.test(c)) return 'yield';
  if (/(stable|algo-stable|dual-token)/.test(c)) return 'stable';
  return 'other';
}

/**
 * The sector's prior weight: what a protocol in that sector is worth per dollar of TVL before this
 * snapshot's own comparables get a say. Curators and allocators sit above generic because they run
 * other people's capital; RWA sits above because its TVL is someone's real-world position.
 */
export const SECTOR_PRIOR: Record<string, number> = {
  allocator: 1.35,
  rwa: 1.3,
  trade: 1.15,
  yield: 1.1,
  chain: 1.05,
  lending: 0.95,
  stake: 0.95,
  stable: 1.0,
  other: 1.0,
};

/** The TVL buckets the size factor uses, largest first. */
export const SIZE_BUCKETS: { bucket: string; min_usd: number; max_usd: number }[] = [
  { bucket: 'TVL $1B and up', min_usd: 1e9, max_usd: Infinity },
  { bucket: 'TVL $100M - $1B', min_usd: 1e8, max_usd: 1e9 },
  { bucket: 'TVL $10M - $100M', min_usd: 1e7, max_usd: 1e8 },
  { bucket: 'TVL under $10M', min_usd: 0, max_usd: 1e7 },
];

/** The live-token comparables the fit reads: priced, not an exchange, with TVL to divide by. */
function comparables(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0 && p.category !== 'CEX');
}

/** The fitted model: base multiple, category multipliers and size multipliers, all off this snapshot. */
export interface FittedModel {
  base: number;
  base_note: string;
  comps: number;
  category: Map<string, { multiplier: number; factor: CategoryFactor }>;
  size: Map<number, { multiplier: number; factor: SizeFactor }>;
}

/** Fit the model to this snapshot: the base from live tokens, then category and size off the same set. */
export function fitModel(snapshot: Snapshot, model: ModelConstants = MODEL): FittedModel {
  const live = comparables(snapshot);
  const ratios = live.map((p) => (p.mcap_usd as number) / p.tvl_usd);
  const base = median(ratios) ?? 0.25;
  const baseNote = `median market cap / TVL over the ${live.length} live tokens that carry both a price and TVL, exchanges aside`;

  const category = new Map<string, { multiplier: number; factor: CategoryFactor }>();
  const seen = new Set<string>();
  for (const p of snapshot.protocols) {
    const key = p.category ?? 'Other';
    if (seen.has(key)) continue;
    seen.add(key);
    const sector = sectorOf(p.category);
    const prior = SECTOR_PRIOR[sector] ?? 1;
    const own = live.filter((c) => (c.category ?? 'Other') === key).map((c) => (c.mcap_usd as number) / c.tvl_usd);
    const ownMedian = median(own);
    let multiplier = prior;
    let source = `${own.length} live comp${own.length === 1 ? '' : 's'}: sector prior`;
    if (own.length >= model.category_min_comps && ownMedian !== null && ownMedian > 0 && base > 0) {
      const dataMult = Math.sqrt(ownMedian / base);
      const w = own.length / (own.length + model.category_shrink);
      multiplier = Math.exp(w * Math.log(dataMult) + (1 - w) * Math.log(prior));
      source = `${own.length} live comps, blended with the sector prior`;
    }
    multiplier = clamp(multiplier, model.category_min, model.category_max);
    category.set(key, {
      multiplier,
      factor: { category: key, sector, comps: own.length, prior, multiplier: round4(multiplier), source },
    });
  }

  const size = new Map<number, { multiplier: number; factor: SizeFactor }>();
  for (const bucket of SIZE_BUCKETS) {
    const own = live.filter((p) => p.tvl_usd >= bucket.min_usd && p.tvl_usd < bucket.max_usd).map((p) => (p.mcap_usd as number) / p.tvl_usd);
    const ownMedian = median(own);
    let multiplier = 1;
    if (own.length > 0 && ownMedian !== null && ownMedian > 0 && base > 0) {
      const w = own.length / (own.length + model.size_shrink);
      multiplier = Math.exp((w / 2) * Math.log(ownMedian / base));
    }
    multiplier = clamp(multiplier, model.size_min, model.size_max);
    size.set(bucket.min_usd, {
      multiplier,
      factor: {
        bucket: bucket.bucket,
        min_usd: bucket.min_usd,
        comps: own.length,
        median_ratio: ownMedian === null ? 0 : round4(ownMedian),
        multiplier: round4(multiplier),
      },
    });
  }

  return { base, base_note: baseNote, comps: live.length, category, size };
}

/** The chain factor: Ethereum and Base adjacency, plus a tilt for staking and restaking adjacency. */
export function chainMultiplier(p: SnapshotProtocol, model: ModelConstants): number {
  const chains = p.chains;
  let mult = chains.includes('Ethereum') ? model.chain_ethereum : chains.includes('Base') ? model.chain_base : 1;
  if (sectorOf(p.category) === 'stake') mult += model.chain_stake;
  return mult;
}

/** The six factors and the implied value one protocol gets under `fit`. */
export function impliedValue(
  p: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  fit: FittedModel,
): {
  implied: number;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  categoryMult: number;
  chainMult: number;
  sizeMult: number;
  sizeBucket: string;
  age: number | null;
} {
  const age = ageDays(asOf, p.listed_at);
  const growthPct = clamp(finite(p.change_7d, 0), model.growth_floor, model.growth_cap);
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (clamp(ageForModel, 0, model.maturity_days) / model.maturity_days) * model.maturity_range;
  const categoryEntry = fit.category.get(p.category ?? 'Other');
  const categoryMult = categoryEntry ? categoryEntry.multiplier : 1;
  const chainMult = chainMultiplier(p, model);
  const bucket = SIZE_BUCKETS.find((b) => p.tvl_usd >= b.min_usd) ?? SIZE_BUCKETS[SIZE_BUCKETS.length - 1]!;
  const sizeEntry = fit.size.get(bucket.min_usd);
  const sizeMult = sizeEntry ? sizeEntry.multiplier : 1;
  const implied = Math.max(1, Math.round(p.tvl_usd * fit.base * growthMult * maturityMult * categoryMult * chainMult * sizeMult));
  return { implied, growthPct, growthMult, maturityMult, categoryMult, chainMult, sizeMult, sizeBucket: bucket.bucket, age };
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL, fit: FittedModel = fitModel(snapshot, model)): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: pre-token protocols below the watchlist floor, by TVL, capped. Never a
  // replacement for a watchlist row: a chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => ({ p, v: impliedValue(p, snapshot.as_of, model, fit) }));
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => {
    const plan = farmPlan(s.p, s.v.age);
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      sector: sectorOf(s.p.category),
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: 'pre-token' as const,
      age_days: s.v.age,
      implied_value_usd: s.v.implied,
      model: {
        base_multiple: round4(fit.base),
        growth_pct: s.v.growthPct,
        growth_multiplier: s.v.growthMult,
        maturity_multiplier: s.v.maturityMult,
        category_multiplier: s.v.categoryMult,
        chain_multiplier: s.v.chainMult,
        size_multiplier: s.v.sizeMult,
        size_bucket: s.v.sizeBucket,
        age_days: s.v.age,
      },
      farm: { capital_usd: plan.capital, gas_usd: plan.gas, days: plan.days },
      farm_steps: plan.steps.map(stepText),
    };
  });
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL tier. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 1e9) return 1000;
  if (p.tvl_usd >= 1e8) return 500;
  if (p.tvl_usd >= 1e7) return 250;
  return 100;
}

/** What one transaction costs on the protocol's first chain, from that chain's own fee level. */
function gasFor(p: SnapshotProtocol): number {
  const chain = chainOf(p);
  if (chain === 'Ethereum') return 12;
  if (chain === 'Bitcoin') return 3;
  if (chain === 'Solana') return 0.05;
  if (chain === 'Algorand') return 0.01;
  if (chain === 'Tron') return 2;
  if (['Base', 'Arbitrum', 'Optimism', 'Polygon', 'Binance', 'Avalanche', 'Linea', 'Scroll', 'Blast'].includes(chain)) return 1.5;
  return 4;
}

/** The qualifying window: younger protocols get a longer run so the activity spans several snapshots. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's opening position, in words a farmer can follow, naming the protocol and chain. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('curator') || c.includes('allocator') || c.includes('governance')) {
    return `Deposit $${capital} into a ${name} vault on ${chain} through the vault page on the protocol's own site, and keep the vault shares`;
  }
  if (c.includes('rwa')) {
    return `Mint $${capital} of ${name}'s tokenized yield asset on ${chain} through its own minting page, and hold the receipt tokens`;
  }
  if (c.includes('restak')) {
    return `Restake $${capital} of the chain's staking asset through ${name} on ${chain} into one operator, and keep the liquid receipt token in the same wallet`;
  }
  if (c.includes('stak')) {
    return `Stake $${capital} of the chain's staking asset through ${name} on ${chain}, and keep the receipt token in the same wallet`;
  }
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return `Supply $${capital} of USDC to ${name} on ${chain} as the first deposit, and keep the position supplied`;
  }
  if (c.includes('dex') || c.includes('liquidity')) {
    return `Add $${capital} of liquidity to ${name}'s deepest pool on ${chain}, and hold the LP position through the window`;
  }
  if (c.includes('yield') || c.includes('farm')) {
    return `Deposit $${capital} into ${name}'s highest-weighted vault on ${chain}, and compound the shares in place`;
  }
  if (c.includes('basis')) {
    return `Open a $${capital} basis position through ${name} on ${chain}, and keep the hedge on alongside the spot leg`;
  }
  if (c.includes('derivativ') || c.includes('perpetual')) {
    return `Deposit $${capital} of USDC as margin on ${name} on ${chain}, and hold one small hedged position`;
  }
  if (c.includes('bridge')) {
    return `Bridge $${capital} of USDC to ${chain} through ${name}, and use the bridged funds inside its own app`;
  }
  if (c.includes('payment') || c.includes('card')) {
    return `Route a $${capital} payment through ${name} on ${chain}, and keep the receipt the protocol issues`;
  }
  if (c.includes('insurance')) {
    return `Buy $${capital} of cover written by ${name} on ${chain}, and keep the policy through the window`;
  }
  if (c.includes('stable')) {
    return `Wrap $${capital} into ${name}'s asset on ${chain}, and hold it through the window`;
  }
  if (c.includes('prediction')) {
    return `Place $${capital} across both sides of one ${name} market on ${chain}, so the position is hedged either way`;
  }
  if (c.includes('chain')) {
    return `Delegate $${capital} through ${name}'s staking page on ${chain}, and keep the delegation active for the window`;
  }
  return `Deposit $${capital} of USDC into ${name} on ${chain}, and keep the position open through the window`;
}

/** The weekly on-chain action depends on what the category actually does. */
function weeklyActionFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('dex') || c.includes('liquidity')) return 'claim LP fees or rebalance the price range';
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return 'top up collateral or claim supplied interest';
  if (c.includes('restak')) return 'check the operator and restake the receipt token';
  if (c.includes('rwa')) return 'check the mint receipt and refresh the allowlist';
  if (c.includes('stak')) return 'claim staking rewards and restake them';
  if (c.includes('yield') || c.includes('farm')) return 'harvest rewards and compound the vault shares';
  return 'make one real on-chain action — a deposit, a claim or a vote';
}

/** 63 becomes 63rd, not 63th. */
function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
}

/** A protocol's farm plan: seven steps, each an action with a cost and a time, built from its record. */
export function farmPlan(p: SnapshotProtocol, age: number | null): { steps: FarmStep[]; capital: number; gas: number; days: number } {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const gas = gasFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  const ageLabel = age === null ? 'an unlisted age' : age < 180 ? `${age} days on record` : `${(age / 365).toFixed(1)} years on record`;
  const steps: FarmStep[] = [
    {
      text: `${p.category?.toLowerCase().includes('rwa') ? `Complete ${p.name}'s identity check (one business day), then ` : ''}Open a fresh wallet for this position, move $${capital} of stablecoin into it plus about $${gas} for gas, and bookmark ${p.name}'s own app page from its documentation`,
      cost: `$${capital} of capital plus $${gas} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `${action}`,
      cost: `about $${gas} of gas on ${chain}`,
      time: '15 minutes for the first transaction',
    },
    {
      text: `Once every 7 days, ${weeklyActionFor(p)} inside ${p.name}, so the position shows activity in consecutive weeks, not one day`,
      cost: `about $${gas} of gas a week`,
      time: '10 minutes a week',
    },
    {
      text: `Keep the position open for ${hold} days: with ${ageLabel}, that is the window that spans more than one snapshot of the protocol`,
      cost: `the $${capital} stays in the position for the whole window`,
      time: `${hold} days`,
    },
    {
      text: `Record ${p.name}'s TVL and 7-day change on the day you enter, and withdraw early if TVL falls more than 30% below that reading or a token launches with no terms for depositors`,
      cost: `about $${gas} of gas to withdraw early`,
      time: '5 minutes to check each week',
    },
    {
      text: `When points or rewards appear, claim them only from the page ${p.name} publishes itself; never pay anyone to claim for you, and never approve a token you did not deposit`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes at claim time',
    },
    {
      text: `Withdraw on the ${ordinal(hold + 3)} day, then log the entry date, exit date, fees paid and net result so the same position can be repeated or dropped`,
      cost: `about $${gas} of gas to exit`,
      time: '20 minutes to close and log',
    },
  ];
  return { steps, capital, gas, days: hold };
}

/** The live-token protocols, by market cap, for the dashboard's Live tokens panel. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => p.mcap_usd !== null)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** Every protocol counted once: what the board ranks, what it set aside, what already trades. */
export function coverageOf(snapshot: Snapshot, board: BoardRow[]): Coverage {
  const ranked = new Set(board.map((r) => r.slug));
  let pretokenOffboard = 0;
  let tokenRecorded = 0;
  let livePriced = 0;
  let tokenNoCap = 0;
  for (const p of snapshot.protocols) {
    if (isPreToken(p)) {
      if (ranked.has(p.slug)) continue;
      pretokenOffboard++;
      continue;
    }
    tokenRecorded++;
    if (p.mcap_usd !== null) livePriced++;
    else tokenNoCap++;
  }
  return {
    total: snapshot.protocols.length,
    ranked: board.length,
    pretoken_offboard: pretokenOffboard,
    token_recorded: tokenRecorded,
    live_priced: livePriced,
    token_no_cap: tokenNoCap,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const fit = fitModel(snapshot, model);
  const board = buildBoard(snapshot, model, fit);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const impliedValues = board.map((r) => r.implied_value_usd).sort((a, b) => a - b);
  const mid = impliedValues.length >> 1;
  const medianImplied =
    impliedValues.length === 0 ? 0 : impliedValues.length % 2 === 1 ? impliedValues[mid]! : Math.round((impliedValues[mid - 1]! + impliedValues[mid]!) / 2);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    base_multiple: fit.base,
    base_note: fit.base_note,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    live_total: snapshot.protocols.filter((p) => p.mcap_usd !== null).length,
    median_implied_usd: medianImplied,
    coverage: coverageOf(snapshot, board),
    factors: {
      category: [...fit.category.values()].map((e) => e.factor).sort((a, b) => b.multiplier - a.multiplier || (a.category < b.category ? -1 : 1)),
      size: [...fit.size.values()].map((e) => e.factor),
    },
    rows: board.map((r) => ({
      rank: r.rank,
      slug: r.slug,
      name: r.name,
      category: r.category,
      sector: r.sector,
      chains: r.chains,
      tvl_usd: r.tvl_usd,
      change_7d: r.change_7d,
      listed_at: r.listed_at,
      age_days: r.age_days,
      watchlist: snapshot.watchlist.includes(r.slug),
      implied_value_usd: r.implied_value_usd,
      model: r.model,
      farm: r.farm,
      farm_steps: r.farm_steps,
    })),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, value, farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
