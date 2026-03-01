# PayUnit Fixed-IP Proxy

This service is a small Node.js HTTP proxy for PayUnit. It is meant to run on a separate host with a stable public IP address (for example Fly.io with an allocated IPv4), so PayUnit can whitelist a fixed origin for `initialize`, `makepayment`, and `paymentstatus` requests.

## Endpoints

- `GET /health` returns a simple JSON health check.
- `POST /proxy` forwards approved PayUnit gateway requests.

## Required environment variables

- `PROXY_SHARED_SECRET`
- `PAYUNIT_API_USER`
- `PAYUNIT_API_PASSWORD`
- `PAYUNIT_API_KEY`

## Optional environment variables

- `PAYUNIT_MODE`
- `PAYUNIT_BASE_URL` (defaults to `https://gateway.payunit.net`)
- `PORT` (defaults to `8080`)

## Request format

`POST /proxy`

Headers:

- `Authorization: Bearer <PROXY_SHARED_SECRET>`

JSON body:

```json
{
  "path": "/api/gateway/initialize",
  "method": "POST",
  "body": {
    "total_amount": 3000
  }
}
```

Only paths under `/api/gateway/` are forwarded.

## Fly.io deployment

1. Copy `fly.toml.example` to `fly.toml`.
2. Change the `app` name to something unique.
3. Run `flyctl launch --no-deploy` from this folder if you need Fly to create the app.
4. Set secrets:

   - `flyctl secrets set PROXY_SHARED_SECRET=...`
   - `flyctl secrets set PAYUNIT_API_USER=...`
   - `flyctl secrets set PAYUNIT_API_PASSWORD=...`
   - `flyctl secrets set PAYUNIT_API_KEY=...`
   - Optional: `flyctl secrets set PAYUNIT_MODE=live`

5. Deploy:

   - `flyctl deploy`

6. Allocate a dedicated IPv4 if PayUnit needs a fixed IP allowlist:

   - `flyctl ips allocate-v4`

## App configuration

In the main Next.js app, set:

- `PAYUNIT_PROXY_URL=https://<your-proxy-domain>`
- `PAYUNIT_PROXY_SHARED_SECRET=<same secret as PROXY_SHARED_SECRET>`

When both are present, the app will use this external proxy before falling back to the Supabase proxy option.
