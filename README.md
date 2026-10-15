# Lumen

Estudio de imagen y vídeo (Lumen 3.0 / 4.0).

## Arranque

```bash
npm install
npm run dev
```

Abre [http://127.0.0.1:8080](http://127.0.0.1:8080).

## Variables (servidor)

No van en el repo. En el hosting:

- `XAI_API_KEY` — generación de imagen, vídeo y voz
- `STRIPE_SECRET_KEY` y `STRIPE_WEBHOOK_SECRET` — pases
- `DATABASE_URL` — Postgres (si no hay, usa PGLite)

## Build

```bash
npm run build
```
