#!/usr/bin/env node
// honest — blocks the shortcuts AI coding agents take to fake "it works".
// Runs as a Claude Code PreToolUse hook. Zero dependencies.
// Exit 0 = allow. Exit 2 = block (stderr goes back to Claude).
//
// "honest: allow <reason>" on a line lets that line through, and the user
// always sees a warning when it does. Strict mode turns allow off entirely:
// set HONEST_STRICT=1, or put a file named .honest-strict in the project root.

const fs = require('fs');
const path = require('path');

const ALLOW = /honest:\s*allow\b\s*(.*)/i;

const TEST_FILE = /(^|[\/\\])(tests?|__tests__|spec)[\/\\]|[._-](test|spec)\.[a-z]+$|(^|[\/\\])test_[^\/\\]+\.py$|_test\.(go|py|rb)$/i;

const RULES = [
  { name: 'skipped test', re: /\b(it|test|describe|context)\.(skip|only)\s*\(|\b(xit|xdescribe|xtest)\s*\(|@pytest\.mark\.(skip|xfail)|@unittest\.skip|\bt\.Skip(Now|f)?\s*\(|#\[ignore\]|@(Disabled|Ignore)\b/ },
  { name: 'silenced type checker', re: /@ts-(ignore|nocheck|expect-error)|#\s*type:\s*ignore|#\s*pyright:\s*ignore|\bas\s+any\b/ },
  { name: 'silenced linter', re: /eslint-disable|#\s*noqa|#\s*pylint:\s*disable|#pragma\s+warning\s+disable|@SuppressWarnings|\/\/\s*nolint|#!\[allow\(/ },
  { name: 'swallowed error', re: /catch\s*(\([^)]*\))?\s*\{\s*\}|except[^:\n]*:\s*(pass|\.\.\.)\s*$|\.catch\(\s*\(\s*\w*\s*\)\s*=>\s*(\{\s*\}|null|undefined)\s*\)|_\s*=\s*err\b/m },
  { name: 'hardcoded test answer', re: /(special[- ]?case|hard[- ]?code[d]?|hack)\b[^\n]{0,40}\btests?\b|\bto make (the )?tests? pass\b|if\s*\(?\s*(process\.env\.)?(NODE_ENV|TESTING|IS_TEST)\b/i },
];

const MULTI = [
  { name: 'swallowed error', re: /except[^:\n]*:\s*\n\s*(pass|\.\.\.)\s*$/m },
  { name: 'swallowed error', re: /catch\s*(\([^)]*\))?\s*\{\s*\n\s*\}/ },
];

const BASH = [
  { name: 'deleted a test file', re: /\b(rm|git\s+rm|unlink|del)\b[^\n|;&]*?(test|spec)/i },
  { name: 'skipped git hooks with --no-verify', re: /--no-verify\b/ },
  { name: 'forced a failing test run to look successful', re: /\b(jest|vitest|pytest|go test|cargo test|npm (run )?test)\b[^\n]*\|\|\s*(true|exit 0|:)\s*$/ },
];

// Claude must never be able to switch honest off. These cannot be allowed.
const STRICT_FILE = /\.honest-strict\b/i;
const REMOVE = /\b(rm|del|erase|rd|rmdir|unlink|mv|move|ren|rename|remove-item|ri|move-item|rename-item|clear-content|set-content|out-file|truncate|shred|git\s+rm|git\s+mv)\b|>\s*[^\s]*\.honest-strict/i;
const PLUGIN_PATH = /[\/\\]plugins[\/\\][^\n]*honest/i;
const SETTINGS = /[\/\\]\.claude[\/\\]settings(\.local)?\.json$/i;

function tamper(what, detail) {
  process.stderr.write(
`honest: BLOCKED — ${what}.
${detail ? detail + '\n' : ''}
Only the user can turn honest off or change its settings. This cannot be
approved with "honest: allow". If you think honest is in the way, stop and
tell the user why.
`);
  process.exit(2);
}

function checkTamper(tool, t, file) {
  if (tool === 'Bash') {
    const cmd = t.command || '';
    if (STRICT_FILE.test(cmd) && REMOVE.test(cmd)) tamper('tried to remove or change .honest-strict', cmd);
    if (strict && /\bgit\s+clean\b/i.test(cmd)) tamper('git clean would delete .honest-strict', cmd);
    if (/\bplugin\s+(disable|uninstall|remove)\b[^\n]*honest/i.test(cmd)) tamper('tried to disable the honest plugin', cmd);
    if (PLUGIN_PATH.test(cmd) && REMOVE.test(cmd)) tamper('tried to change honest itself', cmd);
    if (SETTINGS.test(cmd.split(/\s+/).find((w) => SETTINGS.test(w)) || '') && /honest/i.test(cmd)) tamper('tried to change honest in Claude settings', cmd);
    return;
  }
  if (!['Write', 'Edit', 'MultiEdit'].includes(tool)) return;
  const text = [t.content, t.new_string, ...(t.edits || []).map((e) => e.new_string)].join('\n');
  if (STRICT_FILE.test(path.basename(file)) && tool !== 'Write') tamper('tried to edit .honest-strict', file);
  if (PLUGIN_PATH.test(file)) tamper('tried to edit honest itself', file);
  if (SETTINGS.test(file) && /honest/i.test(text)) tamper('tried to change honest in Claude settings', file);
}

const ASSERT =/\b(assert\w*|expect)\s*[\(.]|\bassert\s|\bshould\.|\bt\.(Error|Fatal)/g;
const count = (s) => (s.match(ASSERT) || []).length;

let strict = false;
const allowed = [];

function block(reason, detail, extra) {
  process.stderr.write(
`honest: BLOCKED — ${reason}.
${detail ? detail + '\n' : ''}
This looks like a shortcut that makes things *look* fixed without fixing them.
Do one of these instead:
  1. Fix the real cause in the code under test.
  2. If you are stuck or the test seems wrong: STOP and tell the user plainly
     what is failing and why. Do not hide it.
${extra || `If the user explicitly approves this exact change, add the comment
"honest: allow <reason>" on the same line and try again.`}
`);
  process.exit(2);
}

// One place decides: block, block (strict), or let through with a warning.
function hit(name, detail, allowSource) {
  const m = (allowSource || '').match(ALLOW);
  if (!m) return block(name, detail);
  if (strict) {
    return block(`${name} (strict mode: "honest: allow" is turned off)`, detail,
`Strict mode is on, so you cannot approve this yourself. Stop and ask the user.
Only the user can make this change, by editing the file by hand.`);
  }
  allowed.push({ name, reason: m[1].replace(/\*\/|-->/g, '').trim() || 'no reason given', detail });
}

function scan(added, file) {
  const where = file ? file + ': ' : '';
  for (const r of MULTI) {
    const m = added.match(r.re);
    if (m) hit(r.name, where + m[0].trim().replace(/\s+/g, ' '), added);
  }
  for (const line of added.split('\n')) {
    for (const r of RULES) {
      if (r.re.test(line)) hit(r.name, where + line.trim().slice(0, 160), line);
    }
  }
}

// Lines in `after` that were not already in `before` (cheap line diff).
function addedLines(before, after) {
  const seen = new Map();
  for (const l of (before || '').split('\n')) seen.set(l, (seen.get(l) || 0) + 1);
  const out = [];
  for (const l of (after || '').split('\n')) {
    const n = seen.get(l) || 0;
    if (n > 0) seen.set(l, n - 1); else out.push(l);
  }
  return out.join('\n');
}

function checkEdit(file, before, after) {
  const added = addedLines(before, after);
  scan(added, file);
  if (TEST_FILE.test(file || '')) {
    const lost = count(before || '') - count(after || '');
    if (lost > 0) hit(`removed ${lost} assertion${lost > 1 ? 's' : ''} from a test file`, file, added);
  }
}

let raw = '';
process.stdin.on('data', (d) => (raw += d));
process.stdin.on('end', () => {
  let input;
  try { input = JSON.parse(raw); } catch { process.exit(0); }
  const tool = input.tool_name || '';
  const t = input.tool_input || {};
  const file = t.file_path || t.path || '';
  const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  strict = /^(1|true|yes)$/i.test(process.env.HONEST_STRICT || '') ||
    fs.existsSync(path.join(root, '.honest-strict'));
  checkTamper(tool, t, file);

  if (tool === 'Write') {
    if (TEST_FILE.test(file) && !(t.content || '').trim()) block('emptied a test file', file);
    scan(t.content || '', file);
  } else if (tool === 'Edit') {
    checkEdit(file, t.old_string, t.new_string);
  } else if (tool === 'MultiEdit') {
    for (const e of t.edits || []) checkEdit(file, e.old_string, e.new_string);
  } else if (tool === 'Bash') {
    const cmd = t.command || '';
    for (const r of BASH) if (r.re.test(cmd)) hit(r.name, cmd, cmd);
  }

  if (allowed.length) {
    const lines = allowed.map((a) => `  • ${a.name} — reason: "${a.reason}"\n    ${a.detail}`).join('\n');
    process.stdout.write(JSON.stringify({
      systemMessage: `⚠️ honest: Claude used "honest: allow" to get past ${allowed.length} check${allowed.length > 1 ? 's' : ''}:\n${lines}\nIf you did not approve this, tell Claude to undo it.`,
    }));
  }
  process.exit(0);
});
