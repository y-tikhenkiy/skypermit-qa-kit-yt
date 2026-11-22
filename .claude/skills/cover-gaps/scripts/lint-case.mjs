#!/usr/bin/env node
// Механічна перевірка файлу тест-кейсу до виклику верифікатора (без моделі).
//
// Використання (з кореня qa-кіту):
//   node .claude/skills/cover-gaps/scripts/lint-case.mjs <файл> --gate <ГЕЙТ|REGISTRATION> --rule "<rule_reference>" [--root <dir>]
//
// Вивід: JSON {file, ok, problems[]} у stdout. Код виходу: 0 — ok, 1 — є проблеми, 2 — помилка запуску.

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';

const GATES = ['PILOT', 'AIRCRAFT', 'ZONE', 'TIME_WINDOW', 'REGISTRATION'];
const TYPES = ['E2E', 'UI', 'API', 'DB', 'Unit'];

function fail(msg) {
  process.stderr.write(`lint-case: ${msg}\n`);
  process.exit(2);
}

const argv = process.argv.slice(2);
let file = null;
let gate = null;
let rule = null;
let root = process.cwd();
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--gate') gate = String(argv[++i] ?? '').toUpperCase();
  else if (a === '--rule') rule = argv[++i];
  else if (a === '--root') root = resolve(argv[++i] ?? '');
  else if (!file && !a.startsWith('--')) file = a;
  else fail(`невідомий аргумент: ${a}`);
}
if (!file) fail('не вказано файл кейсу');
if (!GATES.includes(gate)) fail(`--gate має бути одним із: ${GATES.join(', ')}`);
if (!rule) fail('не вказано --rule');
if (!existsSync(file)) fail(`не знайдено файл ${file}`);

const text = readFileSync(file, 'utf8');
const problems = [];

// Заголовок і поля шаблону.
const header = text.match(/^# (TC-[A-Z]+-\d{3}): .+/m);
if (!header) problems.push('немає заголовка `# <ID>: <назва>`');
const idField = text.match(/^\*\*ID:\*\* (TC-[A-Z]+-\d{3})\s*$/m);
if (!idField) problems.push('немає поля `**ID:**`');
if (header && idField && header[1] !== idField[1]) problems.push(`ID в заголовку (${header[1]}) не збігається з полем ID (${idField[1]})`);
const typeField = text.match(/^\*\*Type:\*\* (\S+)\s*$/m);
if (!typeField) problems.push('немає поля `**Type:**`');
else if (!TYPES.includes(typeField[1])) problems.push(`невідомий Type «${typeField[1]}»; допустимі: ${TYPES.join(', ')}`);
if (!/^\*\*Doc ref:\*\* .*«.+»/m.test(text)) problems.push('Doc ref без дослівної цитати в «…»');

// Розділи в потрібному порядку.
const sections = ['## Preconditions', '## Steps', '## Expected result'];
const positions = sections.map((s) => text.indexOf(s));
sections.forEach((s, i) => positions[i] === -1 && problems.push(`немає розділу «${s}»`));
if (positions.every((p) => p !== -1) && !(positions[0] < positions[1] && positions[1] < positions[2])) {
  problems.push('розділи Preconditions, Steps, Expected result стоять не в тому порядку');
}

// ID відповідає імені файлу й унікальний серед усіх кейсів.
if (idField) {
  if (!basename(file).startsWith(idField[1] + '-')) problems.push(`ім'я файлу не починається з ${idField[1]}-`);
  const dupes = [];
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.startsWith(idField[1] + '-') && resolve(p) !== resolve(file)) dupes.push(p);
    }
  };
  walk(join(root, 'test-cases'));
  if (dupes.length) problems.push(`ID ${idField[1]} уже зайнятий: ${dupes.join(', ')}`);
}

// Expected result: буквальні значення, за якими скрипт покриття впізнає правило.
const expectedStart = text.indexOf('## Expected result');
const expected = expectedStart === -1 ? '' : text.slice(expectedStart);
if (gate === 'REGISTRATION') {
  if (!/\b422\b/.test(expected)) problems.push('в Expected result немає статус-коду `422`');
  if (!text.includes(rule)) problems.push(`у кейсі немає rule_reference «${rule}»`);
} else {
  if (!new RegExp(`failing_gate:\\s*"${gate}"`).test(expected)) problems.push(`в Expected result немає буквально \`failing_gate: "${gate}"\``);
  if (!expected.includes(`rule_reference: "${rule}"`)) problems.push(`в Expected result немає буквально \`rule_reference: "${rule}"\``);
  if (!/\b422\b/.test(expected)) problems.push('в Expected result немає статус-коду `422`');
}

process.stdout.write(JSON.stringify({ file, ok: problems.length === 0, problems }, null, 2) + '\n');
process.exit(problems.length === 0 ? 0 : 1);
