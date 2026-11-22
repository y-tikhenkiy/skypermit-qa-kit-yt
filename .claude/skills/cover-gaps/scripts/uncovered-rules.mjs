#!/usr/bin/env node
// Знаходить бізнес-правила SkyPermit, для яких у test-cases/ ще немає кейсу.
//
// Джерело правил: таблиця «rule_reference values» (§6) у ../skypermit/docs/06-business-rules.md.
// Уточнення з 07-clarifications.md / 05-open-questions.md додаються як примітки до правил.
//
// Використання (з кореня qa-кіту):
//   node .claude/skills/cover-gaps/scripts/uncovered-rules.mjs [--max N] [--gate PILOT|AIRCRAFT|ZONE|TIME_WINDOW|REGISTRATION|ALL] [--root <dir>]
//
// Вивід: JSON у stdout. Помилки: текст у stderr і код виходу 2.

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const GATE_ORDER = ['PILOT', 'AIRCRAFT', 'ZONE', 'TIME_WINDOW', 'REGISTRATION'];

// Уточнення з 07/05, які впливають на очікування для конкретного правила.
// `anchor` — фраза, яка має бути в 07 або 05; якщо її нема, документи змінились і примітка могла застаріти.
const CLARIFICATIONS = [
  {
    match: (r) => /zone inactive|zone active/i.test(r.condition),
    note:
      'Правило визначене, але цитата `ZC-2026.1 §4` не підтверджена (07 §4, 05 рядок 5). Очікується вердикт верифікатора «документація мовчить» щодо rule_reference.',
    anchor: 'Zone `active` flag',
  },
  {
    match: (r) => r.gate === 'AIRCRAFT',
    note:
      'Вагова категорія належить гейту AIRCRAFT, а не ZONE (07 §1). Спільна цитата `ZC-2026.1 §2` з гейтом ZONE; розрізняє їх лише failing_gate.',
    anchor: 'What fails the `AIRCRAFT` gate?',
  },
  {
    match: (r) => r.gate === 'REGISTRATION',
    note:
      'Не гейт: відмова при реєстрації літака (`/aircraft`), `422` без failing_gate, до будь-якого гейта (06 §1.2).',
    anchor: 'Weight ceiling at registration',
  },
];

function fail(msg) {
  process.stderr.write(`uncovered-rules: ${msg}\n`);
  process.exit(2);
}

function parseArgs(argv) {
  const opts = { max: Infinity, gate: 'ALL', root: process.cwd() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--max') {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n < 0) fail('--max має бути невід’ємним цілим числом');
      opts.max = n;
    } else if (a === '--gate') {
      opts.gate = String(argv[++i] ?? '').toUpperCase();
    } else if (a === '--root') {
      opts.root = resolve(argv[++i] ?? '');
    } else {
      fail(`невідомий аргумент: ${a}`);
    }
  }
  if (opts.gate !== 'ALL' && !GATE_ORDER.includes(opts.gate)) {
    fail(`невідомий гейт «${opts.gate}»; допустимі: ${GATE_ORDER.join(', ')}, ALL`);
  }
  return opts;
}

function readOrFail(path) {
  if (!existsSync(path)) fail(`не знайдено файл ${path}`);
  return readFileSync(path, 'utf8');
}

// Розбирає таблицю §6 у 06-business-rules.md.
function parseRules(rulesMd) {
  const lines = rulesMd.split('\n');
  const start = lines.findIndex((l) => /^##\s+6\.\s+`rule_reference`/.test(l));
  if (start === -1) fail('у 06-business-rules.md не знайдено розділ «6. `rule_reference` values»');

  const rules = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^##\s/.test(line) || /^---\s*$/.test(line)) break;
    if (!line.trim().startsWith('|')) continue;
    const cells = line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    if (cells.length < 3 || cells[0] === 'Gate' || /^-+$/.test(cells[0])) continue;

    const gateMatch = cells[0].match(/^`([A-Z_]+)`$/);
    const gate = gateMatch ? gateMatch[1] : /registration/i.test(cells[0]) ? 'REGISTRATION' : null;
    const refMatch = cells[2].match(/`([^`]+)`/);
    if (!gate || !refMatch) fail(`не вдалося розібрати рядок таблиці §6: ${line}`);

    rules.push({
      id: `${gate}:${refMatch[1]}`,
      gate,
      condition: cells[1].replace(/`/g, ''),
      rule_reference: refMatch[1],
    });
  }
  if (rules.length === 0) fail('таблиця §6 порожня або має несподіваний формат');
  return rules;
}

function listCaseFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...listCaseFiles(p));
    else if (/^TC-[A-Z]+-\d+.*\.md$/.test(name)) out.push(p);
  }
  return out;
}

// Правило покрите, якщо кейс називає і його гейт (failing_gate), і його rule_reference.
// Для REGISTRATION гейта нема, тому достатньо rule_reference.
// Це евристика: вона не розуміє зміст кейсу, лише його тексти.
function isCovered(rule, caseTexts) {
  return caseTexts.some((text) => {
    if (!text.includes(rule.rule_reference)) return false;
    if (rule.gate === 'REGISTRATION') return true;
    return new RegExp(`failing_gate[^\\n]{0,40}${rule.gate}`).test(text);
  });
}

const opts = parseArgs(process.argv.slice(2));
const docs = join(opts.root, '..', 'skypermit', 'docs');
const rulesMd = readOrFail(join(docs, '06-business-rules.md'));
const clarMd = readOrFail(join(docs, '07-clarifications.md'));
const openMd = readOrFail(join(docs, '05-open-questions.md'));

const rules = parseRules(rulesMd);
const warnings = [];

for (const rule of rules) {
  rule.notes = [];
  for (const c of CLARIFICATIONS) {
    if (!c.match(rule)) continue;
    rule.notes.push(c.note);
    if (!clarMd.includes(c.anchor) && !openMd.includes(c.anchor) && !rulesMd.includes(c.anchor)) {
      warnings.push(`примітка для ${rule.id} могла застаріти: у документах немає «${c.anchor}»`);
    }
  }
}

const caseTexts = listCaseFiles(join(opts.root, 'test-cases')).map((p) => readFileSync(p, 'utf8'));

// Правила, які вже внесені у відкриті питання (рядок «**Rule:** <id>»), повторно не пропонуються:
// інакше кожен запуск знову створював би й відхиляв той самий кейс.
const openPath = join(opts.root, 'test-cases', 'open-questions.md');
const openQuestionsMd = existsSync(openPath) ? readFileSync(openPath, 'utf8') : '';

const covered = [];
const deferred = [];
const uncovered = [];
for (const rule of rules) {
  if (isCovered(rule, caseTexts)) covered.push(rule.id);
  else if (openQuestionsMd.includes(`**Rule:** ${rule.id}`)) deferred.push(rule.id);
  else uncovered.push(rule);
}

const inScope = uncovered.filter((r) => opts.gate === 'ALL' || r.gate === opts.gate);
inScope.sort((a, b) => GATE_ORDER.indexOf(a.gate) - GATE_ORDER.indexOf(b.gate));
const selected = inScope.slice(0, opts.max);

const groups = GATE_ORDER.map((gate) => ({
  gate,
  rules: inScope.filter((r) => r.gate === gate),
})).filter((g) => g.rules.length > 0);

process.stdout.write(
  JSON.stringify(
    {
      args: { max: Number.isFinite(opts.max) ? opts.max : null, gate: opts.gate },
      total_rules: rules.length,
      covered: covered.length,
      deferred_open_questions: deferred,
      uncovered_total: uncovered.length,
      uncovered_in_scope: inScope.length,
      groups,
      selected,
      warnings,
    },
    null,
    2,
  ) + '\n',
);
