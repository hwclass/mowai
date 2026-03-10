# Mowai Arena — Deployment Guide

One-command deploy via Cloudflare Tunnel + Docker. No DNS configuration. Automatic TLS.

## Prerequisites

- Docker + Docker Compose
- A free [Cloudflare account](https://cloudflare.com)

## Step 1 — Create a Cloudflare Tunnel (one-time, ~2 min)

1. Go to [Cloudflare Zero Trust](https://one.dash.cloudflare.com) → **Networks** → **Tunnels**
2. Click **Create a tunnel** → name it `mowai-arena`
3. Copy the **tunnel token** shown in the install command
4. Under **Public Hostname**, add a route:
   - Subdomain: `arena` (or any name)
   - Domain: your Cloudflare domain
   - Service: `http://arena:8080`
5. Save — your public URL is `https://arena.yourdomain.com`

## Step 2 — Configure environment

```bash
export CLOUDFLARE_TUNNEL_TOKEN=<your-token>
export MOWAI_ADMIN_SECRET=$(openssl rand -hex 32)

# Save for later sessions
echo "CLOUDFLARE_TUNNEL_TOKEN=$CLOUDFLARE_TUNNEL_TOKEN" >> .env
echo "MOWAI_ADMIN_SECRET=$MOWAI_ADMIN_SECRET" >> .env
```

## Step 3 — Deploy

```bash
cd deploy
docker compose up -d
```

## Step 4 — Verify

```bash
curl https://arena.yourdomain.com/health
# → {"status":"ok","agents":0,"uptime":0}
```

## Step 5 — Broadcast a task (workshop lead)

```bash
curl -X POST https://arena.yourdomain.com/task \
  -H "Content-Type: application/json" \
  -H "X-Admin-Secret: $MOWAI_ADMIN_SECRET" \
  -d '{"description": "What is the future of software development?"}'
```

Or use the admin panel: `https://arena.yourdomain.com?admin=1`

## Participant command

Share with participants:

```bash
npx mowai dev --arena wss://arena.yourdomain.com
```

## Logs

```bash
docker compose logs -f arena
```

## Stop

```bash
docker compose down
```
