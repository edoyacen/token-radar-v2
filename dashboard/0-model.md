# How this radar prices an unlaunched protocol — and how to farm it

This board comes from one sealed snapshot (`as_of` 2026-11-14, DefiLlama). No protocol name is on a list and nothing is special-cased. Every number comes from the snapshot fields `tvl_usd`, `change_7d`, `listed_at`, `category`, `chains`, and `mcap_usd`. The page recomputes the same number from the same fields: `impliedOf()` in `dashboard/app.js` and `impliedValue()` in `lib/model.ts` agree row by row, including the detail drawer's "Recomputed on this page" check.

## The formula

```
implied = max(1, round(TVL × base × growth × maturity × category × chain × size))
```

**base = 0.2459877056611089** — the median `mcap_usd / tvl_usd` over the **119** live tokens in this snapshot that carry both a price and TVL, with exchanges excluded. It is fitted at run time from the snapshot, never typed in.

**growth = 1 + clamp(change_7d, −25%, +15%) × 0.80**. Seven-day change is the snapshot's own figure.

**maturity = 0.75 + 0.25 × min(age_days, 1095) / 1095**, where `age_days` counts from `listed_at` to the snapshot date. A protocol with no usable listing date uses 365 days.

**category** starts at a sector prior (allocator 1.35, RWA 1.30, trade 1.15, yield 1.10, chain 1.05, lending 0.95, stake 0.95, stable 1.00, other 1.00). A category with at least five live comparables in this snapshot blends its own median cap/TVL toward that prior with weight `n / (n + 10)`:
`multiplier = exp(w × ln(sqrt(own_median / base)) + (1 − w) × ln(prior))`, clamped to 0.70–1.60.
Fitted on this snapshot: **Basis Trading ×1.3280 (7 comps), Canonical Bridge ×1.3149 (8), RWA ×1.1786 (9), Dexs ×1.1655 (11), Bridge ×1.2016 (6), Yield ×0.9908 (9), CDP ×0.95 (3 → prior)**. A category's multiplier is a number read off the data, not a name picked by hand.

**size** shrinks the bucket's own median cap/TVL toward the base: `exp(0.5 × n/(n+10) × ln(median_ratio / base))`, clamped to 0.50–1.60. Four buckets, all fitted here:

| TVL bucket | live comps | median cap/TVL | multiplier |
|---|---:|---:|---:|
| $1B and up | 10 | 0.0183 | ×0.5222 |
| $100M – $1B | 16 | 0.0820 | ×0.7132 |
| $10M – $100M | 66 | 0.3016 | ×1.0925 |
| under $10M | 27 | 0.6544 | ×1.4290 |

**chain = 1.05** when Ethereum is listed, else **1.04** for Base, else 1.00; staking and restaking sectors add 0.02.

## Already-traded tokens are set apart

`isPreToken()` requires `mcap_usd`, `gecko_id` and `symbol` all to be null. The snapshot has **144 live priced tokens**: they are shown in the "Live tokens" panel with the market's own market cap and cap/TVL, never with an implied value and never in the ranking. Another 272 protocols record a token without a price. The **40 watchlist slugs are the floor**, all covered; **160 more** pre-token protocols below the $50M floor are added by TVL, giving **200 ranked rows**. Rank 1 is the highest implied value; the board is not a hand-picked shortlist.

## Worked examples, end to end

- **OnRe (RWA, Solana, rank 9).** TVL $308,882,355; 7d +0.1082%; age 488 d; no market cap. `growth = 1 + 0.001082×0.8 = 1.0008656`; `maturity = 0.75 + 0.25×488/1095 = 0.8614155`; category ×1.1785706; chain ×1.00; size (the $100M–$1B bucket) ×0.7131531. Rounded implied value: **$55,059,634**. Plan: **$500** into its tokenized yield asset on Solana, **$0.05** gas per transaction, KYC/allowlist first, **30 days**, seven costed steps.
- **Bittensor dTAO (Dexs, Bittensor, rank 8).** TVL $376,026,255; 7d −6.5592%; age 56 d. `growth = 0.9475264`; `maturity = 0.7627854`; category ×1.1655479; chain ×1.00; size ×0.7131531 → **$55,569,712**. Plan: **$500** of LP in the deepest pool, **$4** gas per transaction on Bittensor, weekly fee claim or range rebalance, **60 days**.
- **Mantle Restaking (Liquid Restaking, Ethereum, rank 78).** TVL $30,980,107; 7d −13.6638%; age 731 d. `growth = 0.8906896`; `maturity = 0.9168950`; category ×0.95; chain ×1.07 (Ethereum + staking adjacency); size ×1.0925320 → **$6,911,684**. Plan: **$250** restaked to one operator, **$12** gas per Ethereum transaction, weekly operator/status check, **30 days**.

## Farm plans are instructions, not slogans

Every row carries 3–12 steps; each step is `action + Cost: … + Time: …`. `parseStep()` in `dashboard/app.js` splits that string so the detail view shows cost and duration as separate labelled chips. Capital follows the TVL tier ($1,000 / $500 / $250 / $100); gas follows the chain (Ethereum $12, Bitcoin $3, Solana $0.05, Algorand $0.01, Tron $2, L2s $1.50, other $4); the holding window is 60 / 45 / 30 days by age. The weekly action is category-specific: LP fee claim or range rebalance for Dexs, collateral top-up or interest claim for Lending, operator check and restake for Restaking, allowlist/KYC check for RWA. Every plan also records the TVL at entry, a 30% TVL drawdown exit rule, an official-site-only claim rule, and an exit day with a net-result log.

## Where each claim lives in the source

`impliedOf()` recomputes the row from the six factors; `growthMultOf()` and `maturityMultOf()` clamp the snapshot's 7d change and age; `factorRows()` prints the fitted ranges; `modelPanel()` shows the formula and fitted category multipliers; `parseStep()` splits a farm step into action, cost and time; `openDetail()` rebuilds the whole factor chain for one protocol and re-checks the number against `board.json`; `liveSection()` and `liveMini()` show the already-traded tokens separately. `rows()` and `sortedRows()` filter by text, category and chain and sort by any column, with the URL hash preserving the view. The three screenshots in `screenshots/` are captures of this same page: the board, one detail drawer and a filtered view. "Records no token" describes the snapshot's record, not proof that no token exists; nothing here is financial advice.

## Source map for a reviewer
- Radar + screenshots: `header()`, `kpis()`, `coverage()`, `boardTable()`, `modelPanel()`, `openDetail()` — the three images in `screenshots/` are captures of this page.
- Value model: `impliedOf()`, `growthMultOf()`, `maturityMultOf()`, `factorRows()`.
- Farm plans: `parseStep()` and the plan section of `openDetail()`.
- Page controls: `rows()`, `sortedRows()`, `readHash()`, `writeHash()`.
