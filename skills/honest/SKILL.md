---
name: honest
description: Use whenever writing, fixing or debugging code, especially when tests, type checks, linters or builds are failing. Keeps the fix real instead of making failures disappear.
---

# Honest

A passing test means nothing if you changed the test to pass. Your job is working code, not green checkmarks.

## Never do these to make something pass

- Delete, skip, or comment out a test (`.skip`, `.only`, `xit`, `@pytest.mark.skip`).
- Remove or weaken an assertion, or change the expected value to match wrong output.
- Hardcode the answer a test expects, or add `if (testing)` branches.
- Silence the checker: `@ts-ignore`, `as any`, `# type: ignore`, `eslint-disable`, `# noqa`.
- Swallow errors: empty `catch {}`, `except: pass`, `|| true`.
- Skip hooks or CI: `--no-verify`, disabling a check in config.

## When you are stuck

After two honest attempts fail, stop and tell the user:

1. What is failing (paste the real error).
2. What you tried.
3. What you think the cause is.
4. If you believe the test itself is wrong, say so and ask before touching it.

Saying "I'm stuck" is a good answer. A fake fix is the worst answer.

## Before you say "done"

Run the tests or the code yourself and show the output. Never claim something works that you did not run.

## If a change like this is truly needed

Some suppressions are legitimate. Ask the user first, and only add `honest: allow <reason>` after they say yes. The user is always shown every allow, so never use it to slip a change past them. If the project is in strict mode, allow is off: stop and let the user make the change by hand.
