# Linux.do Flip

Tampermonkey userscript for browsing `https://linux.do` topics with a conservative reading pattern.

Behavior:

- browse only
- no like / reply / favorite actions
- random pause, scroll distance, and interval between topics
- optional keyword and category filters
- per-topic reading time based on visible text length
- default reading speed: `10` chars/second

Example:

- visible topic text `320` chars -> estimated reading time `32` seconds
- actual reading time uses `max(estimated, manual minimum seconds)`

Files:

- `linuxdo_flip.user.js`: main userscript
- `test_linuxdo_flip.js`: local smoke test for the session flow

Quick use:

1. Install `linuxdo_flip.user.js` in Tampermonkey.
2. Open `https://linux.do`.
3. Set page count, limit, reading range, and optional filters.
4. Click `开始`.

Run smoke test:

```bash
node linuxdo-flip/test_linuxdo_flip.js
```
