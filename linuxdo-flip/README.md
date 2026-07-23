# Linux.do Flip

Tampermonkey userscript for browsing `https://linux.do` topics with a conservative reading pattern.

Behavior:

- browse only
- no like / reply / favorite actions
- random pause, scroll distance, and interval between topics
- optional keyword and category filters
- per-topic reading time based on visible text length
- draggable panel with explicit resize handle
- reading speed is elastic, not fixed
- default base reading speed: `10` chars/second

Example:

- visible topic text `320` chars + base speed `10` -> actual single-topic speed may be `8 / 9 / 11 / 15 / 22`
- the script samples one actual speed per topic, then estimates the whole-topic reading time from that sampled speed
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
