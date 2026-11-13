# PENA AI Backend

Cloudflare Worker backend for PENA AI.

## Files
- `worker.js`: API endpoint `/api/write`.
- `wrangler.toml`: Worker name and entry point.
- `package.json`: Wrangler deploy script.

## Cloudflare Worker secrets/variables
Required secrets:
- `OPENAI_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

Optional variable:
- `OPENAI_MODEL` (defaults to `gpt-6.1-terra`)

Allowed browser origin is `https://pena-ai-engine.pages.dev`. Update `ALLOWED_ORIGINS` in `worker.js` if the Pages domain changes.

Never commit API keys or other secrets to this repository.
