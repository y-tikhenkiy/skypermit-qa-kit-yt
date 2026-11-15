#!/usr/bin/env node
// SessionEnd-хук: підсумок usage з transcript-а сесії в reports/ws2/<дата>-<session_id>.md
// Структуру transcript-а звірено з реальними файлами (~/.claude/projects/<slug>/<session_id>.jsonl):
//  - assistant-записи: message.id, message.model, message.usage; один API-виклик розбитий на кілька
//    записів з однаковим message.id, тому дедуплікуємо і беремо запис з найбільшим output_tokens;
//  - субагенти лежать окремо: <session_id>/subagents/agent-<id>.jsonl + .meta.json.
// stdin SessionEnd (code.claude.com/docs/en/hooks#sessionend): session_id, transcript_path, cwd, hook_event_name, reason
//  (clear | resume | logout | prompt_input_exit | other). Документація попереджає, що transcript пишеться асинхронно
//  і може не містити найсвіжіших повідомлень. SessionEnd має бюджет 1.5 с, тому в settings.json заданий timeout.
// НЕ верифіковано: формат compact-записів у transcript-і (шукаємо subtype=compact_boundary); документація його не описує.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIELDS = ['input', 'output', 'cache_read', 'cache_write_5m', 'cache_write_1h', 'cache_write_unsplit'];

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  return raw ? JSON.parse(raw) : {};
}

function readJsonl(path) {
  const out = [];
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* пошкоджений рядок пропускаємо */ }
  }
  return out;
}

function resolveTranscript(stdin) {
  if (stdin.transcript_path && existsSync(stdin.transcript_path)) return stdin.transcript_path;
  const sid = stdin.session_id;
  if (!sid) return null;
  const cwd = stdin.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const slug = cwd.replace(/[^a-zA-Z0-9]/g, '-'); // /Users/a.b/c -> -Users-a-b-c (збігається з реальним slug)
  const p = join(homedir(), '.claude', 'projects', slug, `${sid}.jsonl`);
  return existsSync(p) ? p : null;
}

const emptyTotals = () => Object.fromEntries(FIELDS.map((f) => [f, 0]));

// Дедуплікація за message.id: лишаємо запис з найбільшим output_tokens (стрімінг дописує output).
function collectCalls(records, scope) {
  const byId = new Map();
  for (const r of records) {
    const m = r.type === 'assistant' ? r.message : null;
    if (!m?.usage || !m.model || !m.id) continue;
    const key = `${scope}:${m.id}`;
    const prev = byId.get(key);
    if (!prev || (m.usage.output_tokens ?? 0) >= (prev.usage.output_tokens ?? 0)) {
      byId.set(key, { model: m.model, usage: m.usage, thinking: m.usage.output_tokens_details?.thinking_tokens ?? 0 });
    }
  }
  return [...byId.values()];
}

function addUsage(t, u) {
  t.input += u.input_tokens ?? 0;
  t.output += u.output_tokens ?? 0;
  t.cache_read += u.cache_read_input_tokens ?? 0;
  const cc = u.cache_creation;
  if (cc && (cc.ephemeral_5m_input_tokens != null || cc.ephemeral_1h_input_tokens != null)) {
    t.cache_write_5m += cc.ephemeral_5m_input_tokens ?? 0;
    t.cache_write_1h += cc.ephemeral_1h_input_tokens ?? 0;
  } else {
    t.cache_write_unsplit += u.cache_creation_input_tokens ?? 0;
  }
}

function loadPrices() {
  try { return JSON.parse(readFileSync(join(HERE, 'prices.json'), 'utf8')).models ?? {}; } catch { return {}; }
}

// Точний збіг, інакше найдовший ключ-префікс (claude-haiku-4-5-20251001 -> claude-haiku-4-5).
function priceFor(prices, model) {
  if (prices[model]) return prices[model];
  const key = Object.keys(prices).filter((k) => model.startsWith(k)).sort((a, b) => b.length - a.length)[0];
  return key ? prices[key] : null;
}

// Повертає { usd, missing[] }: сума лише за компонентами, для яких ціна відома.
function cost(t, price) {
  const map = { input: 'input', output: 'output', cache_read: 'cache_read', cache_write_5m: 'cache_write_5m', cache_write_1h: 'cache_write_1h' };
  let usd = 0;
  const missing = [];
  for (const [f, pf] of Object.entries(map)) {
    if (!t[f]) continue;
    const p = price?.[pf];
    if (p == null) missing.push(f); else usd += (t[f] / 1e6) * p;
  }
  if (t.cache_write_unsplit) missing.push('cache_write_unsplit');
  return { usd, missing };
}

const n = (x) => x.toLocaleString('en-US');
const usd = (x) => `$${x.toFixed(4)}`;
const costCell = (c) => (c.missing.length ? `${usd(c.usd)}+ (немає ціни: ${c.missing.join(', ')})` : usd(c.usd));

function main(stdin) {
  const transcript = resolveTranscript(stdin);
  if (!transcript) throw new Error(`transcript не знайдено (transcript_path=${stdin.transcript_path}, session_id=${stdin.session_id})`);
  const sessionId = stdin.session_id || basename(transcript, '.jsonl');
  const main = readJsonl(transcript);
  const prices = loadPrices();

  // Агенти: головна сесія + кожен субагент окремо.
  const agents = [{ label: 'main', type: 'main', description: '', calls: collectCalls(main, 'main') }];
  const subDir = join(dirname(transcript), sessionId, 'subagents');
  if (existsSync(subDir)) {
    for (const f of readdirSync(subDir).filter((x) => x.endsWith('.jsonl')).sort()) {
      const id = f.replace(/^agent-/, '').replace(/\.jsonl$/, '');
      let meta = {};
      try { meta = JSON.parse(readFileSync(join(subDir, f.replace(/\.jsonl$/, '.meta.json')), 'utf8')); } catch { /* meta необов'язкова */ }
      agents.push({ label: id, type: meta.agentType ?? '?', description: meta.description ?? '', calls: collectCalls(readJsonl(join(subDir, f)), id) });
    }
  }

  const perModel = new Map();
  for (const a of agents) {
    a.totals = emptyTotals();
    a.perModel = new Map();
    for (const c of a.calls) {
      for (const [map, key] of [[perModel, c.model], [a.perModel, c.model]]) {
        if (!map.has(key)) map.set(key, { t: emptyTotals(), calls: 0, thinking: 0 });
        const e = map.get(key);
        addUsage(e.t, c.usage);
        e.calls++; e.thinking += c.thinking;
      }
      addUsage(a.totals, c.usage);
    }
  }

  const compact = main.filter((r) => r.subtype === 'compact_boundary' || r.isCompactSummary === true).length;
  const when = new Date();
  const date = `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}-${String(when.getDate()).padStart(2, '0')}`;

  const L = [];
  L.push(`# Usage report: ${sessionId}`, '');
  L.push(`- Дата звіту: ${date}`, `- Transcript: \`${transcript}\``, `- Причина завершення: ${stdin.reason ?? 'невідомо (поля reason у stdin немає)'}`);
  L.push(`- Унікальних API-викликів: ${agents.reduce((s, a) => s + a.calls.length, 0)} (після дедуплікації за message.id)`, '');

  L.push('## По моделях (уся сесія з субагентами)', '');
  L.push('| Модель | Викликів | Input | Output | Cache read | Cache write 5m | Cache write 1h | Cache write (без розбивки) | Вартість |', '|---|---:|---:|---:|---:|---:|---:|---:|---|');
  let grand = 0; let grandMissing = new Set();
  for (const [model, e] of [...perModel].sort()) {
    const c = cost(e.t, priceFor(prices, model));
    grand += c.usd; c.missing.forEach((m) => grandMissing.add(m));
    if (!priceFor(prices, model)) grandMissing.add(`ціна моделі ${model}`);
    L.push(`| ${model} | ${e.calls} | ${n(e.t.input)} | ${n(e.t.output)} | ${n(e.t.cache_read)} | ${n(e.t.cache_write_5m)} | ${n(e.t.cache_write_1h)} | ${n(e.t.cache_write_unsplit)} | ${costCell(c)} |`);
  }
  L.push('', `**Разом: ${usd(grand)}${grandMissing.size ? `+ (неповно, немає цін: ${[...grandMissing].join(', ')})` : ''}**`, '');
  L.push('Thinking-токени по моделях (з `output_tokens_details.thinking_tokens`, довідково, окремо від Output не додавати):', '');
  for (const [model, e] of [...perModel].sort()) L.push(`- ${model}: ${n(e.thinking)}`);

  L.push('', '## Субагенти', '');
  const subs = agents.slice(1);
  if (!subs.length) L.push('Субагентів не знайдено (немає каталогу `<session_id>/subagents/`).');
  else {
    L.push('| agentId | Тип | Опис | Викликів | Моделі | Input | Output | Cache read | Вартість |', '|---|---|---|---:|---|---:|---:|---:|---|');
    for (const a of subs) {
      let usdSum = 0; const miss = new Set();
      for (const [model, e] of a.perModel) { const c = cost(e.t, priceFor(prices, model)); usdSum += c.usd; c.missing.forEach((m) => miss.add(m)); }
      L.push(`| ${a.label} | ${a.type} | ${a.description} | ${a.calls.length} | ${[...a.perModel.keys()].join(', ')} | ${n(a.totals.input)} | ${n(a.totals.output)} | ${n(a.totals.cache_read)} | ${miss.size ? `${usd(usdSum)}+ (немає ціни: ${[...miss].join(', ')})` : usd(usdSum)} |`);
    }
  }

  L.push('', '## Compact', '');
  L.push(`Знайдено записів compact (\`subtype: compact_boundary\` або \`isCompactSummary\`): **${compact}**.`);
  L.push('_Формат compact-записів не верифіковано на реальних даних: у проаналізованих transcript-ах таких записів не було._', '');
  L.push('## Примітки', '', '- Ціни з `.claude/hooks/prices.json`; "немає ціни" означає `null` у файлі, а не нуль. Суму позначено `+`, якщо вона неповна.', '- Токени субагентів беруться з їхніх файлів, бо `toolUseResult` у батьківському transcript-і не містить usage.');

  const root = process.env.CLAUDE_PROJECT_DIR || stdin.cwd || process.cwd();
  const outDir = join(root, 'reports', 'ws2');
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, `${date}-${sessionId}.md`);
  writeFileSync(outFile, L.join('\n') + '\n');
  return outFile;
}

try {
  const out = main(await readStdin());
  process.stderr.write(`usage-report: ${out}\n`);
} catch (e) {
  process.stderr.write(`usage-report: ${e.message}\n`);
}
process.exit(0); // хук ніколи не має ламати завершення сесії
