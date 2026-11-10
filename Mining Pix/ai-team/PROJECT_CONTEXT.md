# Mining Pix — Project Context

## Product
Mining Pix is a browser-based, sandbox game project. It is not a real financial product and must not be represented as one. In-game PIX COIN, balances, mining power, VIP status, rewards, and wallet features are simulations unless the owner explicitly changes the product scope and obtains the required legal/security review.

## Technology
- React 19
- TypeScript
- Vite
- Node.js 22 in GitHub Actions
- Tests: `node --experimental-strip-types --test tests/*.test.mjs`
- Build/type-check: `npm run build`
- Application directory: `Mining Pix/`
- Vite base path: `/Mining-Pix/`
- GitHub Pages preview is configured for branch `codex/mining-pix-work`.

## Repository workflow
- Main repository: `AndersonSR2004/Mining-Pix`
- Working branch: `codex/mining-pix-work`
- Pull request #1 is intentionally kept as a draft for review.
- Never push directly to `main`, merge a pull request, or publish a production release.
- Changes must be proposed through a separate branch and pull request, and require the owner's approval.

## Existing gameplay reference
There are three minigames: Flappy Pix, Pix Snake, and Coin Catch.
Each game has separate progression. A level advances after three wins at the current level.
Target objectives: level 1 = 10; level 2 = 15; level 3 = 20; level 4 = 25; then +5 per level.
A game lasts 45 seconds. Cooldown after a completed game: level 1 = 10s; level 2 = 20s; level 3 = 30s; level 4+ = 60s.
A win grants +1 PIX COIN and +1 H/s temporary mining power for 24 hours. The existing active temporary hash amount is accumulated on wins and its expiry is renewed. A completed game renews the 24-hour period of an existing active temporary hash; a loss does not grant a coin or new hash. If the hash has expired, a loss must not revive it. A win after expiry starts a new +1 H/s period. Mission progress counts completed games regardless of win/loss.
These are sandbox/localStorage mechanics, not real payments.

## Agent task
Inspect the current repository state rather than assuming this context is still perfectly current. Report discrepancies between implementation and this document. Prefer minimal, maintainable changes and preserve the current visual design.
