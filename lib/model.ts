export type Protocol = {
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
};

export function isPreToken(p: Protocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

export function isRankable(p: Protocol, asOf: string): boolean {
  if (!isPreToken(p)) return false;
  
  const badCategories = new Set([
    'CEX', 'Bridge', 'Canonical Bridge', 'Liquid Staking',
    'Liquid Restaking', 'Restaked BTC'
  ]);
  if (p.category && badCategories.has(p.category)) return false;

  const versionRegex = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
  if (p.name && versionRegex.test(p.name)) return false;

  const forbiddenWords = /\b(wrapped|staked|staking)\b/i;
  if (p.name && forbiddenWords.test(p.name)) return false;

  const exchangeNames = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)/i;
  if (p.name && exchangeNames.test(p.name)) return false;

  return true;
}

export function calculateImpliedValue(p: Protocol, asOf: string): { value: number; breakdown: any } {
  const asOfDate = new Date(asOf);
  const listedDate = p.listed_at ? new Date(p.listed_at) : null;
  const age_days = listedDate ? Math.max(0, Math.floor((asOfDate.getTime() - listedDate.getTime()) / (1000 * 60 * 60 * 24))) : null;
  
  const growth_pct = p.change_7d === null ? 0 : Math.max(-50, Math.min(100, p.change_7d));
  const growthMult = 1 + (growth_pct / 100) * 0.75;
  const ageMult = age_days === null ? 1.00 : 0.80 + 0.35 * Math.min(age_days, 730) / 730;
  const chainMult = 1 + 0.02 * Math.min(Math.max(p.chains.length - 1, 0), 5);
  
  const baseMultiple = p.tvl_usd < 100_000_000 ? 0.35 : p.tvl_usd < 1_000_000_000 ? 0.30 : p.tvl_usd < 5_000_000_000 ? 0.22 : 0.15;
  
  const cat = p.category;
  const categoryMult = (cat && ['CDP', 'Stablecoin', 'Stablecoin Wrapper', 'Insurance', 'Governance Incentives'].includes(cat)) ? 0.90 : 
                       (cat && ['Payments', 'Chain'].includes(cat)) ? 0.85 : 1.00;

  const value = Math.max(1, Math.round(p.tvl_usd * baseMultiple * growthMult * ageMult * chainMult * categoryMult));
  
  return {
    value,
    breakdown: {
      base_multiple: Number(baseMultiple.toFixed(4)),
      growth_pct: Number(growth_pct.toFixed(4)),
      growth_multiplier: Number(growthMult.toFixed(4)),
      age_multiplier: Number(ageMult.toFixed(4)),
      chain_multiplier: Number(chainMult.toFixed(4)),
      category_multiplier: Number(categoryMult.toFixed(4)),
      age_days
    }
  };
}

export function generateFarmSteps(p: Protocol, tvl: number, ageDays: number | null): string[] {
  const capital = tvl >= 5_000_000_000 ? 250 : tvl >= 1_000_000_000 ? 150 : tvl >= 100_000_000 ? 100 : 50;
  const gas = p.chains[0] === 'Ethereum' ? 10 : 2;
  const hold = ageDays === null ? 30 : ageDays < 180 ? 60 : ageDays < 365 ? 45 : 30;
  
  const cat = p.category ? p.category.toLowerCase() : '';
  
  const step2 = cat.includes('lend') || cat.includes('cdp') || cat.includes('collateral') ? `Supply $${capital} of USDC to ${p.name} on ${p.chains[0]} and keep the position open.` :
                cat.includes('dex') || cat.includes('yield') || cat.includes('leveraged farm') ? `Provide $${capital} of liquidity to ${p.name}'s main pool on ${p.chains[0]} and keep the position open.` :
                cat.includes('bridge') ? `Bridge $${capital} of USDC to ${p.chains[0]} through ${p.name} and use the bridged funds in its app.` :
                cat.includes('staking') || cat.includes('restak') ? `Stake $${capital} of the chain's staking asset through ${p.name} and keep the receipt.` :
                cat.includes('perpetual') || cat.includes('derivative') ? `Deposit $${capital} of USDC as margin on ${p.name} and open one small hedge.` :
                cat.includes('prediction') ? `Fund $${capital} and place one market position on ${p.name}.` :
                cat.includes('curator') || cat.includes('allocator') ? `Deposit $${capital} into a ${p.name} vault on ${p.chains[0]} and keep the shares.` :
                cat.includes('stable') ? `Mint or deposit $${capital} of the stable asset through ${p.name} on ${p.chains[0]}.` :
                cat.includes('rwa') ? `Mint $${capital} of the protocol's yield asset on ${p.chains[0]} and hold it.` :
                cat.includes('insurance') ? `Buy $${capital} of cover from ${p.name} on ${p.chains[0]} and keep the policy.` :
                cat.includes('governance') ? `Deposit $${capital} into ${p.name} on ${p.chains[0]}, then vote in its governance.` :
                cat.includes('payment') ? `Route $${capital} of volume through ${p.name} on ${p.chains[0]} and keep using it.` :
                `Deposit $${capital} of USDC into ${p.name} on ${p.chains[0]} and keep the position open.`;

  const step3 = cat.includes('lend') || cat.includes('cdp') || cat.includes('collateral') ? `Borrow a small amount against the supply and repay it the same week.` :
                cat.includes('dex') || cat.includes('yield') || cat.includes('leveraged farm') ? `Swap a small amount in the pool each week so the wallet shows trading activity.` :
                cat.includes('curator') || cat.includes('allocator') ? `Vote in the vault's governance or reallocate a small share between vaults.` :
                cat.includes('rwa') ? `Claim any yield the position earns and redeposit it.` :
                cat.includes('perpetual') || cat.includes('derivative') ? `Close the hedge and open a fresh one the following week.` :
                `Use a second feature of ${p.name}, a vote, a second asset, or a second chain, at least once.`;

  return [
    `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline. Cost: under $3 of gas for the first transaction. Time: 5 minutes.`,
    `${step2} Cost: $${capital} of capital and about $${gas} of gas. Time: 15 minutes to set up.`,
    `${step3} Cost: about $2 of gas. Time: 10 minutes a week.`,
    `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote. Cost: about $2 of gas a week. Time: 10 minutes a week.`,
    `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot. Cost: the $${capital} stays in the position. Time: ${hold} days.`,
    `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes. Never pay to claim. Then write the wallet, the dates and every transaction in a farm log. Cost: no fee to check. Time: 15 minutes.`
  ];
}
