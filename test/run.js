// node test/run.js — feeds fake tool calls to the hook and checks block/allow.
const { spawnSync } = require('child_process');
const path = require('path');
const HOOK = path.join(__dirname, '..', 'hooks', 'honest.js');

const fs = require('fs');
const os = require('os');
const call = (tool_name, tool_input, { env = {}, cwd } = {}) =>
  spawnSync('node', [HOOK], {
    input: JSON.stringify({ tool_name, tool_input, cwd: cwd || os.tmpdir() }),
    env: { ...process.env, HONEST_STRICT: '', CLAUDE_PROJECT_DIR: '', ...env },
    encoding: 'utf8',
  });
const run = (tool_name, tool_input) => call(tool_name, tool_input).status;

const W = (file_path, content) => ['Write', { file_path, content }];
const E = (file_path, old_string, new_string) => ['Edit', { file_path, old_string, new_string }];
const B = (command) => ['Bash', { command }];

const BLOCK = [
  ['skip a test', W('src/a.test.ts', "it.skip('adds', () => {})")],
  ['only a test', W('src/a.spec.js', "describe.only('x', () => {})")],
  ['pytest skip', W('tests/test_a.py', '@pytest.mark.skip\ndef test_a(): pass')],
  ['go skip', W('a_test.go', 't.Skip("later")')],
  ['ts-ignore', W('src/a.ts', '// @ts-ignore\nconst x = y')],
  ['as any', W('src/a.ts', 'const x = y as any')],
  ['type: ignore', W('a.py', 'x = f()  # type: ignore')],
  ['eslint-disable', W('a.js', '/* eslint-disable */')],
  ['noqa', W('a.py', 'import os  # noqa')],
  ['empty catch', W('a.js', 'try { run() } catch (e) {}')],
  ['except pass', W('a.py', 'try:\n    run()\nexcept Exception:\n    pass')],
  ['hardcoded answer', W('a.js', '// special case for the failing test\nif (n === 3) return 6')],
  ['test-only branch', W('a.js', "if (process.env.NODE_ENV === 'test') return 42")],
  ['removed assertion', E('src/a.test.ts', 'expect(add(1,2)).toBe(3)\nexpect(add(2,2)).toBe(4)', 'expect(add(1,2)).toBe(3)')],
  ['changed nothing but deleted asserts', E('tests/test_a.py', 'assert f(1) == 2', '')],
  ['emptied test file', W('src/a.test.ts', '')],
  ['rm test file', B('rm src/a.test.ts')],
  ['git rm tests', B('git rm -r tests/')],
  ['no-verify', B('git commit -m "fix" --no-verify')],
  ['force pass', B('npm test || true')],
];

const ALLOW = [
  ['normal code', W('src/a.ts', 'export const add = (a: number, b: number) => a + b')],
  ['normal test', W('src/a.test.ts', "it('adds', () => { expect(add(1,2)).toBe(3) })")],
  ['adding an assertion', E('src/a.test.ts', 'expect(add(1,2)).toBe(3)', 'expect(add(1,2)).toBe(3)\nexpect(add(2,2)).toBe(4)')],
  ['real catch', W('a.js', 'try { run() } catch (e) { log(e); throw e }')],
  ['existing suppression untouched', E('a.ts', '// @ts-ignore\nconst x = y\nconst a = 1', '// @ts-ignore\nconst x = y\nconst a = 2')],
  ['approved with honest: allow', W('a.ts', 'const x = window as any // honest: allow third-party typings missing')],
  ['rm a build dir', B('rm -rf dist')],
  ['run tests', B('npm test')],
  ['word "test" in prose', W('README.md', 'Run the test suite before you ship.')],
];

let fail = 0;
for (const [name, [tool, input]] of BLOCK) {
  const ok = run(tool, input) === 2;
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  blocks  ${name}`);
}
for (const [name, [tool, input]] of ALLOW) {
  const ok = run(tool, input) === 0;
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  allows  ${name}`);
}
// honest: allow — goes through, but the user is always warned.
const extra = [];
const allowLine = W('a.ts', 'const x = window as any // honest: allow lib has no types');
{
  const r = call(...allowLine);
  extra.push(['allow warns the user', r.status === 0 && /honest: allow/.test(JSON.parse(r.stdout || '{}').systemMessage || '')]);
}
{
  const r = call(...W('src/a.ts', 'export const ok = 1'));
  extra.push(['no warning on clean code', r.status === 0 && r.stdout === '']);
}
{
  const r = call(...allowLine, { env: { HONEST_STRICT: '1' } });
  extra.push(['strict mode (env) blocks allow', r.status === 2 && /strict mode/.test(r.stderr)]);
}
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'honest-'));
  fs.writeFileSync(path.join(dir, '.honest-strict'), '');
  const r = call(...allowLine, { cwd: dir });
  extra.push(['strict mode (.honest-strict file) blocks allow', r.status === 2]);
  fs.rmSync(dir, { recursive: true });
}
for (const [name, ok] of extra) {
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
}
const total = BLOCK.length + ALLOW.length + extra.length;
console.log(`\n${total - fail}/${total} passed`);
process.exit(fail ? 1 : 0);
