# Knowledge-Ball

Knowledge-Ball is a shared knowledge graph. User-created nodes are persisted by the bundled HTTP service and loaded by every browser when the app starts.

## Run locally

```bash
npm install
npm run build
npm run server
```

Open `http://localhost:8787/Knowledge-Ball/`. Data is stored in `data/knowledge.json`; set `KNOWLEDGE_DATA_FILE` to place it on a persistent volume and `PORT` to change the listening port.

The reusable English starter catalog is stored at `data/catalog/knowledge-starters.en.json`. It contains 20 domains with 10 definition–reasoning–conclusion records per domain and is intentionally not imported into the live graph automatically.

Knowledge nodes are stored canonically in English. To accept drafts in other languages, configure `TRANSLATION_API_URL` with a LibreTranslate-compatible HTTP endpoint. The create dialog translates non-English titles and reasoning, then requires the contributor to review and confirm the English version before submission.

For frontend development, run `npm run server` and `npm run dev` in separate terminals. Vite proxies `/api/knowledge` to the service on port 8787.

## Deployment

Deploy the application as the Node service (`npm start`) with a persistent volume for `data/`. A static-only host such as GitHub Pages cannot accept user writes, so it cannot provide cross-user node sharing by itself. Put authentication and rate limiting at the hosting platform or reverse proxy before opening submissions to untrusted traffic.
