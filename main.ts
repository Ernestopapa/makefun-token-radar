import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { isRankable, calculateImpliedValue, generateFarmSteps } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const inputDir = process.argv.includes('--input') ? process.argv[process.argv.indexOf('--input') + 1] : '/input';
const outputDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';

const snapshotPath = inputDir.endsWith('.json') ? inputDir : join(inputDir, 'snapshot.json');
if (!existsSync(snapshotPath)) {
  process.stderr.write(`token radar: no snapshot at ${snapshotPath}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
  process.exit(2);
}
const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));

const asOf = snapshot.as_of;
const watchlistSlugs = new Set(snapshot.watchlist);

const allProtocols = snapshot.protocols;

const rankableProtocols = allProtocols.filter(p => isRankable(p, asOf));

const watchlistRows = rankableProtocols.filter(p => watchlistSlugs.has(p.slug));
const earlyRows = rankableProtocols.filter(p => !watchlistSlugs.has(p.slug) && p.tvl_usd < snapshot.floor_usd);

const boardRowsRaw = [...watchlistRows, ...earlyRows];
const boardRows = boardRowsRaw.map(p => {
    const { value, breakdown } = calculateImpliedValue(p, asOf);
    const listedDate = p.listed_at ? new Date(p.listed_at) : null;
    const asOfDate = new Date(asOf);
    const age_days = listedDate ? Math.max(0, Math.floor((asOfDate.getTime() - listedDate.getTime()) / (1000 * 60 * 60 * 24))) : null;

    return {
        ...p,
        token_status: "pre-token",
        age_days,
        implied_value_usd: value,
        model: breakdown,
        farm_steps: generateFarmSteps(p, p.tvl_usd, age_days)
    };
});

boardRows.sort((a, b) => b.implied_value_usd - a.implied_value_usd || a.slug.localeCompare(b.slug));
boardRows.forEach((row, i) => (row as any).rank = i + 1);

// Self-check
if (boardRows.length !== 178) { console.error(`Board size expected 178, got ${boardRows.length}`); process.exit(1); }
if (watchlistRows.length !== 40) { console.error(`Watchlist size expected 40, got ${watchlistRows.length}`); process.exit(1); }
for(const row of boardRows) {
  if (row.farm_steps.some(s => s.length < 20 || s.length > 600)) { console.error(`Farm step length invalid for ${row.slug}`); process.exit(1); }
}

const liveProtocols = allProtocols.filter(p => p.mcap_usd !== null && p.category !== 'CEX');
liveProtocols.sort((a, b) => (b.mcap_usd || 0) - (a.mcap_usd || 0) || b.tvl_usd - a.tvl_usd);

const excluded_counts = {
  has_token: allProtocols.filter(p => !p.mcap_usd && p.gecko_id && p.symbol).length,
  cex: allProtocols.filter(p => p.category === 'CEX').length,
  trap: allProtocols.filter(p => !isRankable(p, asOf) && !p.mcap_usd && p.category !== 'CEX').length,
  floor_rule: allProtocols.filter(p => isRankable(p, asOf) && p.tvl_usd >= snapshot.floor_usd && !watchlistSlugs.has(p.slug)).length
};

const outputData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    watchlist_size: watchlistRows.length,
    board_size: boardRows.length,
    early_size: earlyRows.length,
    live_size: liveProtocols.length,
    total_protocols: allProtocols.length,
    model: { constants: { version: 'radar-2' } },
    model_version: 'radar-2',
    excluded_counts,
    rows: boardRows,
    live: liveProtocols.slice(0, 24)
};

if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

writeFileSync(join(outputDir, 'board.json'), JSON.stringify({ rows: boardRows }, null, 2) + '\n');
writeFileSync(join(outputDir, 'data.js'), `window.RADAR=${JSON.stringify(outputData)};\n`);

// Copy dashboard and screenshots
const entryDir = fileURLToPath(new URL('.', import.meta.url));
cpSync(join(entryDir, 'dashboard'), join(outputDir, 'dashboard'), { recursive: true });
cpSync(join(entryDir, 'screenshots'), join(outputDir, 'screenshots'), { recursive: true });

const dossier = buildDossier(outputDir, { 
    text_max_bytes: 65536, 
    screenshots: { max: 4, max_bytes: 524288 }, 
    dashboard: { max_files: 400, max_bytes: 4194304 } 
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);

