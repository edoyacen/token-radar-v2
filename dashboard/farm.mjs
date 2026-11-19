// Farm plans, shared by lib/model.ts (the board) and app.js (the detail view). A plan is generated
// from the protocol's own category, chains, TVL and age: capital from the TVL tier, gas from the
// chain, hold from the listing age, and the core action from the category family. No name is hard-coded.

const CAPITAL_TIERS = [
  { min: 5e9, usd: 500 },
  { min: 2e9, usd: 350 },
  { min: 1e9, usd: 300 },
  { min: 250e6, usd: 200 },
  { min: 50e6, usd: 150 },
  { min: 10e6, usd: 100 },
  { min: 0, usd: 50 },
];

const GAS_BY_CHAIN = {
  Ethereum: 12,
  Base: 2,
  Arbitrum: 2,
  Optimism: 2,
  Binance: 1,
  Solana: 1,
  Polygon: 1,
  Avalanche: 2,
  Bitcoin: 7,
  Tron: 2,
  'Hyperliquid L1': 1,
};

export function primaryChain(protocol) {
  const chains = Array.isArray(protocol.chains) ? protocol.chains : [];
  for (const chain of chains) if (typeof chain === 'string' && chain.length > 0) return chain;
  return 'its main chain';
}

export function capitalFor(tvl) {
  for (const tier of CAPITAL_TIERS) if (tvl >= tier.min) return tier.usd;
  return 50;
}

export function gasFor(chain) {
  return GAS_BY_CHAIN[chain] || 4;
}

export function holdDaysFor(age) {
  if (typeof age !== 'number' || !Number.isFinite(age)) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  if (age < 730) return 30;
  return 21;
}

export function family(category) {
  const c = (category || '').toLowerCase();
  if (c.indexOf('rwa') >= 0) return 'rwa';
  if (c.indexOf('risk curator') >= 0 || c.indexOf('curator') >= 0) return 'curator';
  if (c.indexOf('allocator') >= 0) return 'allocator';
  if (c.indexOf('restaking') >= 0) return 'restaking';
  if (c.indexOf('liquid staking') >= 0 || c.indexOf('staking pool') >= 0) return 'staking';
  if (c.indexOf('collateral') >= 0) return 'collateral';
  if (c.indexOf('lending') >= 0) return 'lending';
  if (c.indexOf('cdp') >= 0) return 'cdp';
  if (c.indexOf('stablecoin') >= 0) return 'stablecoin';
  if (c.indexOf('chain') >= 0) return 'chain';
  if (c.indexOf('dex') >= 0 || c.indexOf('liquidity') >= 0) return 'dex';
  if (c.indexOf('yield') >= 0 || c.indexOf('farm') >= 0) return 'yield';
  if (c.indexOf('basis') >= 0) return 'basis';
  if (c.indexOf('derivative') >= 0 || c.indexOf('perpetual') >= 0) return 'derivatives';
  if (c.indexOf('insurance') >= 0) return 'insurance';
  if (c.indexOf('bridge') >= 0) return 'bridge';
  if (c.indexOf('payment') >= 0) return 'payments';
  if (c.indexOf('governance') >= 0) return 'governance';
  if (c.indexOf('cefi') >= 0) return 'cefi';
  return 'default';
}

function coreAction(name, kind, capital, chain) {
  if (kind === 'rwa') return `Subscribe $${capital} to ${name}'s yield-bearing RWA on ${chain}, hold the receipt token in the dedicated wallet, and keep it through the next distribution.`;
  if (kind === 'curator') return `Deposit $${capital} of USDC into ${name}'s flagship curated vault on ${chain}, keep the vault shares, and record the vault address and share price at entry.`;
  if (kind === 'allocator') return `Allocate $${capital} of USDC to ${name}'s flagship strategy on ${chain}, keep the position receipt, and note the allocation and fee terms before depositing.`;
  if (kind === 'restaking') return `Stake $${capital} of ${chain}'s native asset through ${name}, keep the liquid receipt token, and do not unstake before the hold window closes.`;
  if (kind === 'staking') return `Stake $${capital} of ${chain}'s native asset through ${name}, keep the staking receipt, and leave it untouched for the full hold window.`;
  if (kind === 'collateral') return `Supply $${capital} of USDC as collateral to ${name} on ${chain}, borrow at most 25% against it, and keep the health factor above 2.0.`;
  if (kind === 'lending') return `Supply $${capital} of USDC to ${name} on ${chain}, borrow no more than 25% against it, and keep the health factor above 2.0 through the window.`;
  if (kind === 'cdp') return `Lock $${capital} of collateral in ${name} on ${chain}, mint at most a third of its value, and keep the position above the liquidation ratio.`;
  if (kind === 'stablecoin') return `Mint $${capital} of ${name}'s stable wrapper on ${chain}, hold the wrapped asset in the same wallet, and redeem only after the hold window.`;
  if (kind === 'chain') return `Delegate $${capital} of ${chain}'s native asset to a ${name} validator, leave it bonded, and vote on at least one on-chain proposal during the window.`;
  if (kind === 'dex') return `Provide $${capital} of liquidity to ${name}'s deepest pool on ${chain}, keep the LP position in range, and claim trading fees once a week.`;
  if (kind === 'yield') return `Deposit $${capital} into ${name}'s main yield vault on ${chain}, keep the receipt token, and compound once during the hold window.`;
  if (kind === 'basis') return `Allocate $${capital} to ${name}'s delta-neutral basis strategy on ${chain} and keep it through at least four funding periods.`;
  if (kind === 'derivatives') return `Deposit $${capital} of USDC as margin on ${name} on ${chain}, open one small hedge, and keep leverage below 2x.`;
  if (kind === 'insurance') return `Buy $${capital} of cover from ${name} on ${chain}, keep the policy active for the full term, and record the policy id.`;
  if (kind === 'bridge') return `Bridge $${capital} of USDC to ${chain} through ${name}, then deploy the bridged funds in its destination app within 24 hours.`;
  if (kind === 'payments') return `Route $${capital} of USDC through ${name} on ${chain}, keep the balance active, and make at least one payment each week.`;
  if (kind === 'governance') return `Lock $${capital} of the governance-eligible asset in ${name} on ${chain} and vote on at least one live proposal.`;
  if (kind === 'cefi') return `Deposit $${capital} of USDC into ${name}'s on-chain vault on ${chain} and keep the balance through the full window.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open through the full hold window.`;
}

function upkeepAction(name, kind) {
  if (kind === 'rwa') return `Reinvest one ${name} distribution into the same asset, and keep a screenshot of the receipt balance for the farm log.`;
  if (kind === 'curator' || kind === 'allocator') return `Check ${name}'s vault share price and capacity weekly, and top up only if the vault stays below its stated limit.`;
  if (kind === 'restaking' || kind === 'staking') return `Claim ${name} rewards once, restake only the native asset, and keep the receipt token untouched.`;
  if (kind === 'collateral' || kind === 'lending' || kind === 'cdp') return `Review ${name}'s health factor weekly; repay or add collateral before it falls below 2.0.`;
  if (kind === 'chain') return `Check ${name} validator uptime weekly and re-delegate only if it misses more than one epoch.`;
  if (kind === 'dex') return `Rebalance ${name}'s LP position once if it leaves range, and harvest trading fees on the same visit.`;
  if (kind === 'yield') return `Compound ${name}'s yield once in the window and keep the receipt in the same wallet.`;
  if (kind === 'basis') return `Verify ${name}'s funding rate stays positive; exit early if it turns negative for two periods.`;
  if (kind === 'derivatives') return `Check ${name}'s margin ratio weekly and add margin if the position falls below 2x.`;
  if (kind === 'stablecoin') return `Check ${name}'s peg and redemption queue weekly; redeem early if the peg breaks by more than 1%.`;
  if (kind === 'insurance') return `Review ${name}'s cover terms before expiry and renew only if the premium is unchanged.`;
  if (kind === 'bridge') return `Verify the ${name} bridge transaction finalized, then keep the destination position for the full window.`;
  if (kind === 'payments') return `Make one small ${name} payment each week from the same wallet and keep the receipts.`;
  if (kind === 'governance') return `Vote on every ${name} proposal in the window and keep the locked balance untouched.`;
  if (kind === 'cefi') return `Check ${name}'s vault attestation weekly and withdraw if the stated backing changes.`;
  return `Check ${name}'s app weekly, claim any published rewards, and keep the position unchanged.`;
}

// Six steps, each naming the protocol, chain, capital, gas and duration a farmer actually faces.
export function farmPlan(protocol, age) {
  const chain = primaryChain(protocol);
  const capital = capitalFor(protocol.tvl_usd);
  const gas = gasFor(chain);
  const hold = holdDaysFor(age);
  const kind = family(protocol.category);
  const name = protocol.name;
  return [
    {
      text: `Create a dedicated wallet, send $${capital} of capital plus about $${gas * 3} for gas on ${chain}, and record the address before any deposit.`,
      cost: `$${capital} capital + about $${gas * 3} gas`,
      time: '20 minutes',
    },
    {
      text: coreAction(name, kind, capital, chain),
      cost: `$${capital} deployed + about $${gas} gas for entry`,
      time: '15 to 30 minutes',
    },
    {
      text: upkeepAction(name, kind),
      cost: `about $${gas} gas per action`,
      time: '10 minutes a week',
    },
    {
      text: `Keep the position open for at least ${hold} days from the first deposit so it spans at least two weekly snapshots.`,
      cost: `$${capital} stays deployed; no extra fee`,
      time: `${hold} days`,
    },
    {
      text: `Reserve about $${gas * 4} for entry, upkeep and exit gas on ${chain}, and keep that reserve outside the farm position.`,
      cost: `about $${gas * 4} gas all-in`,
      time: 'one-time reserve',
    },
    {
      text: `Exit in one transaction from ${name}'s own app, withdraw to a separate wallet, and log the deposit date, hold period and gas in a farm ledger.`,
      cost: `about $${gas} gas to withdraw`,
      time: '15 minutes',
    },
  ];
}

export function stepText(step) {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}
