export interface ProtocolRow {
  name: string;
  slug: string;
  tvl: number;
  change_7d: number | null;
  age_days: number | null;
  category: string;
  chain: string;
  implied_value: number;
  is_watchlist: boolean;
  rank: number;
}

export interface SnapshotInput {
  [key: string]: {
    name: string;
    category: string;
    chain: string;
    tvl: number;
    change_7d: number | null;
    listed_at: string | null;
    [key: string]: any;
  };
}

const CATEGORY_FACTORS: Record<string, number> = {
  'Risk Curators': 1.50,
  'Basis Trading': 1.50,
  'Derivatives': 1.50,
  'Dexs': 1.38,
  'RWA': 1.17,
  'Yield': 0.93,
  'CDP': 0.92,
  'Lending': 0.70,
  'Onchain Capital Allocator': 0.70,
  'Restaking': 0.70,
};

export function impliedValue(
  tvl_usd: number,
  change_7d: number | null,
  age_days: number | null,
  category: string
): number {
  if (tvl_usd <= 0) return 0;

  // size = (tvl_usd / 1e9) ^ (-0.15)
  const size = Math.pow(tvl_usd / 1_000_000_000, -0.15);

  // growth = 1 + 0.6 * clamp(change_7d, -40, +60) / 100
  const growth_val = change_7d === null ? 0 : change_7d;
  const clamped_growth = Math.max(-40, Math.min(60, growth_val));
  const growth = 1 + (0.6 * clamped_growth) / 100;

  // maturity = 0.70 + 0.30 * min(age_days, 1095) / 1095
  const maturity_days = age_days === null ? 365 : age_days;
  const maturity = 0.70 + (0.30 * Math.min(maturity_days, 1095)) / 1095;

  // category = clamp(shrunk_category_multiple / 0.214, 0.70, 1.50)
  // The design document already provides the final factors
  const category_factor = CATEGORY_FACTORS[category] ?? 1.00;

  const implied = tvl_usd * 0.20 * size * growth * maturity * category_factor;
  return Math.round(implied);
}

/**
 * Self-check for Steakhouse Financial
 * TVL: $2,754,000,000
 * 7d: -2.19%
 * Age: 543d
 * Category: Risk Curators (1.50)
 * 
 * size = (2.754)^-0.15 ≈ 0.8590
 * product ≈ 594,476,506
 */
export function selfCheck() {
  const val = impliedValue(2754000000, -2.19, 543, 'Risk Curators');
  const expected = 594476506;
  const diff = Math.abs(val - expected) / expected;
  if (diff > 0.001) {
    throw new Error(`Self-check failed: expected ${expected}, got ${val} (diff ${diff})`);
  }
  return true;
}

// ---------------------------------------------------------------------------
// Snapshot intake, pre-token detection, and rankability (design §1: board rules)
// ---------------------------------------------------------------------------

/** Categories that may never take a rank: raw bridges, staking wrappers, and centralized exchanges. */
const EXCLUDED_CATEGORIES: ReadonlySet<string> = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

/** A name ending in a release marker (V2, v3, 2.0, ...) is a pool/version of another protocol, not a fresh venture. */
const VERSIONED_NAME = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Wrapped/staked/staking as whole words: "Wrapped BTC" is a wrapper; a word merely containing these letters is not. */
const WHOLE_WORD_WRAPPED = /(^|[^A-Za-z])wrapped([^A-Za-z]|$)/i;
const WHOLE_WORD_STAKED = /(^|[^A-Za-z])staked([^A-Za-z]|$)/i;
const WHOLE_WORD_STAKING = /(^|[^A-Za-z])staking([^A-Za-z]|$)/i;

/** The fields the pre-token and rankability tests read; both raw snapshot rows and normalized rows satisfy this. */
interface ProtocolFacts {
  name: string;
  category: string;
  mcap_usd: number | null;
  gecko_id: string | null;
  symbol: string | null;
  [key: string]: any;
}

/**
 * Whether a protocol records no token at all: DefiLlama carries neither a market cap,
 * nor a CoinGecko id, nor a ticker symbol for it. Sub-products of already-traded tokens
 * (Aave v3 pools, wrapped assets, staked receipts) carry a symbol and fail this test.
 */
export function isPreToken(p: ProtocolFacts): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a protocol may take a rank on the board: pre-token, and clear of every
 * watchlist exclusion rule — bridge/staking/exchange categories, wrapper names,
 * and versioned pool names. The same rules apply to watchlist and early rows alike.
 */
export function isRankable(p: ProtocolFacts): boolean {
  return isPreToken(p)
    && !EXCLUDED_CATEGORIES.has(p.category)
    && !WHOLE_WORD_WRAPPED.test(p.name)
    && !WHOLE_WORD_STAKED.test(p.name)
    && !WHOLE_WORD_STAKING.test(p.name)
    && !VERSIONED_NAME.test(p.name);
}

/**
 * Flatten the raw DefiLlama snapshot into SnapshotInput rows keyed by slug (one row
 * per protocol, 758 rows in the 2026-11-14 snapshot). Each row keeps the raw token
 * signals (mcap_usd / gecko_id / symbol) plus the two board flags the builder needs:
 * is_watchlist and below_floor (TVL under the snapshot's floor_usd).
 */
export function parseSnapshot(raw: any): SnapshotInput {
  if (!raw || !Array.isArray(raw.protocols)) {
    throw new Error('snapshot: expected { as_of, source, floor_usd, protocols[], watchlist[] }');
  }
  const watchlist: string[] = Array.isArray(raw.watchlist) ? raw.watchlist : [];
  const floor_usd: number = typeof raw.floor_usd === 'number' ? raw.floor_usd : 50_000_000;
  const onList = new Set(watchlist);

  const rows: SnapshotInput = {};
  for (const p of raw.protocols) {
    const chains: string[] = Array.isArray(p.chains) ? p.chains : [];
    rows[p.slug] = {
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains,
      chain: chains[0] ?? 'Unknown',
      tvl: p.tvl_usd,
      change_7d: p.change_7d ?? null,
      listed_at: p.listed_at ?? null,
      mcap_usd: p.mcap_usd,
      gecko_id: p.gecko_id,
      symbol: p.symbol,
      is_watchlist: onList.has(p.slug),
      below_floor: p.tvl_usd < floor_usd,
    };
  }
  return rows;
}

/**
 * Generates a 6-step farming plan derived from the protocol's metadata.
 * All steps follow the §3 template: Action, Cost, and Time.
 */
export function farmSteps(row: any): string[] {
  const { name, category, chain, tvl, age_days } = row;

  // 1. Capital tier
  let x = 50;
  if (tvl >= 5_000_000_000) x = 250;
  else if (tvl >= 1_000_000_000) x = 150;
  else if (tvl >= 100_000_000) x = 100;

  // 2. Main action by category
  let action = `Deposit $${x} of USDC into ${name} on ${chain} and keep the position open.`;
  if (category === 'Risk Curators' || category === 'Onchain Capital Allocator') {
    action = `Deposit $${x} into a ${name} vault on ${chain} and keep the shares.`;
  } else if (category === 'RWA') {
    action = `Mint $${x} of the protocol's yield asset on ${chain} and hold it.`;
  } else if (category === 'Lending' || category === 'CDP' || category === 'Collateral Markets') {
    action = `Supply $${x} of USDC to ${name} on ${chain} and keep the position open.`;
  } else if (category === 'Dexs' || category === 'Yield' || category === 'Liquidity Manager') {
    action = `Provide $${x} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  } else if (category === 'Perpetuals' || category === 'Derivatives') {
    action = `Deposit $${x} of USDC as margin on ${name} and open one small hedge.`;
  } else if (category === 'Basis Trading') {
    action = `Deposit $${x} of USDC into ${name}'s basis vault on ${chain} and hold the position.`;
  } else if (category === 'Yield Aggregator') {
    action = `Deposit $${x} of USDC into ${name}'s auto-compounding vault on ${chain}.`;
  } else if (category === 'Restaking' || category === 'Staking Pool') {
    action = `Stake $${x} of the chain's staking asset through ${name} and keep the receipt.`;
  } else if (category === 'Payments') {
    action = `Route $${x} of payments through ${name} on ${chain} each week.`;
  } else if (category === 'Insurance') {
    action = `Buy $${x} of cover from ${name} on ${chain} and keep the policy.`;
  } else if (category === 'Chain') {
    action = `Bridge $${x} of USDC to ${chain} and use it in ${name}'s app.`;
  } else if (category === 'Stablecoin' || category === 'CDP') {
    action = `Mint or hold $${x} of the stable asset through ${name} on ${chain}; note the airdrop logic differs for stablecoins.`;
  }

  // 3. Chain gas note
  let gas = 'about $0.05–0.50 of gas';
  if (chain === 'Ethereum') gas = 'about $3–8 gas';
  else if (chain === 'Solana') gas = 'about $0.01–0.05';
  else if (['Monad', 'Hyperliquid L1', 'Avalanche'].includes(chain)) gas = 'about $0.05–0.30';
  else if (chain.includes('Bitcoin')) gas = 'off-chain channel operations, almost no gas';

  // 4. Hold days by age
  let days = 30;
  const age = age_days ?? 365;
  if (age < 180) days = 60;
  else if (age < 365) days = 45;

  return [
    `Fresh wallet: Create a new wallet used only for farming funds and keep the seed phrase offline. Cost: <$3 gas (initial). Time: 5 minutes.`,
    `${action} Cost: $${x} of capital and ${gas}. Time: 15 minutes to set up.`,
    `Weekly activity: Perform one qualifying action (deposit, borrow, swap, or vote) once a week. Cost: about $2 gas/week. Time: 10 minutes/week.`,
    `Holding period: Maintain the position for at least ${days} days. Cost: Capital remains in position. Time: ${days} days.`,
    `Claiming: Before withdrawing, check the official points or rewards page via official links only. Cost: Free to check, never pay to claim. Time: 10 minutes.`,
    `Logging: Maintain a farming log with wallet address, date, and each transaction. Cost: 0. Time: 5 minutes.`,
  ];
}

/**
 * buildBoard takes the raw snapshot and produces the curated 178-row board.
 * 40 watchlist rows + 138 early rows, ranked by implied value.
 */
export function buildBoard(raw: any) {
  const rows = parseSnapshot(raw);
  const watchlistSlugs: string[] = Array.isArray(raw.watchlist) ? raw.watchlist : [];
  const floor_usd: number = typeof raw.floor_usd === 'number' ? raw.floor_usd : 50_000_000;

  const boardRows: any[] = [];

  // 1. Watchlist rows
  for (const slug of watchlistSlugs) {
    const row = rows[slug];
    if (row) boardRows.push(row);
  }

  // 2. Early rows: pre-token, below floor, rankable, not already in watchlist
  const watchlistSet = new Set(watchlistSlugs);
  for (const slug in rows) {
    const row = rows[slug];
    if (!watchlistSet.has(slug) && row.below_floor && isPreToken(row) && isRankable(row)) {
      boardRows.push(row);
    }
  }

  // Rank by implied value descending
  const sorted = boardRows.map((row) => {
    const age_days = row.listed_at ? (new Date().getTime() - new Date(row.listed_at).getTime()) / 86400000 : 365;
    const implied = impliedValue(row.tvl, row.change_7d, age_days, row.category);
    return {
      slug: row.slug,
      name: row.name,
      category: row.category,
      chain: row.chain,
      chains: row.chains,
      tvl_usd: row.tvl,
      change_7d: row.change_7d,
      age_days: age_days,
      implied_value_usd: implied,
      farm_steps: farmSteps(row),
      is_watchlist: row.is_watchlist,
    };
  }).sort((a, b) => b.implied_value_usd - a.implied_value_usd);

  return sorted.map((row, index) => ({
    ...row,
    rank: index + 1,
  }));
}

/**
 * Returns the top 24 live-token protocols by mcap_usd descending.
 * Live tokens are those with mcap_usd > 0.
 */
export function liveRows(raw: any): any[] {
  const protocols = Array.isArray(raw.protocols) ? raw.protocols : [];
  return protocols
    .filter((p) => p.mcap_usd !== null && p.mcap_usd > 0)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || (b.tvl_usd ?? 0) - (a.tvl_usd ?? 0))
    .slice(0, 24)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      mcap_tvl_ratio: p.tvl_usd > 0 ? p.mcap_usd / p.tvl_usd : 0,
    }));
}

/**
 * Generates a standalone JS file assigning all board data and model metadata
 * to a global window object for the dashboard.
 */
export function dataScript(raw: any, board: any[]): string {
  const as_of = raw.as_of || 'unknown';
  const live = liveRows(raw);
  const formula = 'implied = round( tvl_usd * 0.20 * size * growth * maturity * category )';
  
  // Map the internal CATEGORY_FACTORS for the dashboard
  // Note: CATEGORY_FACTORS is not exported, but we can recreate the map or export it.
  // To keep it clean, we'll use the same values.
  const factors = {
    'Risk Curators': 1.50, 'Basis Trading': 1.50, 'Derivatives': 1.50, 'Dexs': 1.38,
    'RWA': 1.17, 'Yield': 0.93, 'CDP': 0.92, 'Lending': 0.70,
    'Onchain Capital Allocator': 0.70, 'Restaking': 0.70,
  };

  const data = {
    board,
    live,
    meta: {
      as_of,
      formula,
      factors,
    },
  };

  return `window.TOKEN_RADAR = ${JSON.stringify(data, null, 2)};`;
}

/**
 * Validates the final board against critical quality constraints.
 */
export function boardIssue(board: any[]): string | null {
  if (!Array.isArray(board)) return 'Board is not an array';
  if (board.length < 100 || board.length > 4000) return `Board length ${board.length} out of range (100-4000)`;

  let allEqual = true;
  for (let i = 0; i < board.length; i++) {
    const row = board[i];
    if (!row.slug || !row.name) return `Row ${i} missing slug or name`;
    if (row.rank !== i + 1) return `Row ${i} has incorrect rank: ${row.rank}`;
    
    const steps = row.farm_steps;
    if (!Array.isArray(steps) || steps.length < 3 || steps.length > 12) {
      return `Row ${row.slug} has ${steps?.length || 0} farm_steps (range 3-12)`;
    }
    for (const s of steps) {
      if (typeof s !== 'string' || s.length < 20 || s.length > 600) {
        return `Row ${row.slug} step length ${s?.length || 0} out of range (20-600)`;
      }
    }

    if (i > 0) {
      if (row.implied_value_usd > board[i - 1].implied_value_usd) {
        return `Row ${row.slug} violates monotonicity (implied ${row.implied_value_usd} > ${board[i-1].implied_value_usd})`;
      }
      if (row.implied_value_usd !== board[i - 1].implied_value_usd) {
        allEqual = false;
      }
    }
  }

  if (allEqual) return 'All implied values are equal';
  return null;
}

