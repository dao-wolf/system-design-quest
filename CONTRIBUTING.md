# Contributing

Thanks for helping. Small, focused pull requests are easiest to review.

## Set up

```sh
pnpm install
python3 -m pip install -r requirements.txt
pnpm exec playwright install chromium
pnpm check
```

## How we work

1. Start from the outside: write a failing Playwright journey for the change.
2. Add a failing unit test underneath, then make both pass.
3. Keep tests about behaviour. Don't test styles or internals.

## Challenges

- Write every challenge yourself. Use public sources for facts, never their
  sentences.
- Follow [CONTENT.md](CONTENT.md): bite-sized, plain words, and every
  explanation says what, why and the fix.
- Run `pnpm gate` before you push. Nothing reaches the game unless it passes.

## Found a wrong answer?

Use the [Report a wrong answer](https://github.com/dao-wolf/system-design-quest/issues/new?template=wrong-answer.yml) form.

## Licence

By contributing, you license your code under MIT and your challenges under
CC BY 4.0.
