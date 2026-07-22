# Linux.do Flip

Tampermonkey userscript for browsing `https://linux.do` topics with a conservative reading pattern.

Behavior:

- browse only
- no like / reply / favorite actions
- random pause, scroll distance, and interval between topics
- optional keyword and category filters

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
node tools/linuxdo/test_linuxdo_flip.js
```
