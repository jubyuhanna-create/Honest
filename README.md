# honest

**Stop Claude from cheating.**

When an AI agent can't fix a failing test, it sometimes makes the failure disappear instead:
it skips the test, deletes the assertion, adds `@ts-ignore`, or hardcodes the answer.
Everything turns green. Nothing actually works.

`honest` blocks those shortcuts before they happen, and tells Claude to fix the real problem or say it's stuck.

```
● Edit src/cart.test.ts

  honest: BLOCKED — removed 1 assertion from a test file.

  This looks like a shortcut that makes things look fixed without fixing them.
  Fix the real cause, or stop and tell the user what is failing.

● I couldn't get the discount test to pass. The test expects 90 but
  applyDiscount() returns 89.99 because of float rounding. Should I
  round to cents in applyDiscount(), or is the test wrong?
```

That second message is the point. You get the truth instead of a fake green check.

## Install

In Claude Code:

```
/plugin marketplace add jubyuhanna-create/Honest
/plugin install honest@honest
```

Done. It works in every project from now on.

**Not on Claude Code?** Copy [`honest.md`](honest.md) into your `CLAUDE.md`, `AGENTS.md`, or `.cursorrules`. You get the rules without the hard block.

## What it catches

| Shortcut | Examples |
|---|---|
| Skipping tests | `it.skip`, `.only`, `xit`, `@pytest.mark.skip`, `t.Skip()` |
| Deleting tests | removing assertions, emptying a test file, `rm *.test.ts` |
| Silencing the type checker | `@ts-ignore`, `as any`, `# type: ignore` |
| Silencing the linter | `eslint-disable`, `# noqa`, `@SuppressWarnings` |
| Swallowing errors | `catch {}`, `except: pass`, `npm test \|\| true` |
| Hardcoding answers | `// special case for test`, `if (NODE_ENV === 'test')` |
| Skipping checks | `git commit --no-verify` |

It only looks at what Claude **adds**. Code that was already there is left alone.

## How it works

Two parts:

1. **A skill** that tells Claude the rules and what to do when stuck.
2. **A hook** that checks every edit before it's written. If it finds a shortcut, the edit is blocked and Claude is told why. Rules can be forgotten. A hook can't be argued with.

One file, no dependencies, works with any language.

## When a suppression is actually fine

Sometimes `@ts-ignore` is the right call. Approve it, and Claude adds a reason on the same line:

```ts
const el = window as any // honest: allow third-party lib has no types
```

`honest` lets it through, and the next person reading the code knows why.

You always see it when this happens. Nothing gets past quietly:

```
⚠️ honest: Claude used "honest: allow" to get past 1 check:
  • silenced type checker — reason: "third-party lib has no types"
If you did not approve this, tell Claude to undo it.
```

### Strict mode

Don't want Claude approving anything on its own? Turn `honest: allow` off completely:

```
touch .honest-strict
```

Put that file in your project root (or set `HONEST_STRICT=1`). Now only you can add a suppression, by editing the file yourself.

## Why this exists

This isn't a hypothetical. Anthropic's own system cards describe Claude "special-casing" tests when stuck, by hardcoding expected outputs or editing the tests themselves. Research like ImpossibleBench found that a clear "stop, don't carve out the code" rule cuts this dramatically.

`honest` is that rule, plus a lock on the door.

## Test it

```
node test/run.js
```

## License

MIT
