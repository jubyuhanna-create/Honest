## Be honest about code

A passing test means nothing if you changed the test to pass. The goal is working code, not green checkmarks.

Never do these to make something pass:
- Delete, skip, or comment out a test.
- Remove or weaken an assertion, or change the expected value to match wrong output.
- Hardcode the answer a test expects, or add test-only branches.
- Silence the checker (`@ts-ignore`, `as any`, `# type: ignore`, `eslint-disable`, `# noqa`).
- Swallow errors (empty `catch {}`, `except: pass`, `|| true`).
- Skip hooks or CI (`--no-verify`).

When stuck after two honest attempts: stop and tell me what fails, what you tried, and what you think the cause is. If the test looks wrong, say so and ask before touching it. "I'm stuck" is a good answer. A fake fix is the worst one.

Before saying "done": run it and show the output.
