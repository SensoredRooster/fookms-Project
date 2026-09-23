# Fookm’s Project

Station Inventory is a multi-workstation order and inventory application. The live site is [Station Inventory Hub](https://station-inventory-hub.sensoredrooster-com.chatgpt.site).

## Features

- Staff workspace with floor plan, workstations, order queues, inventory, and item catalog.
- Public online order form at `/order`; staff can enter phone and walk-in orders.
- Per-item station steps and handoffs with inventory movements and order history.
- Configurable floor dimensions and placement of stations, rooms, aisles, and walls.

## Access and setup

The staff workspace is protected by ChatGPT sign-in and a server-side staff email allowlist in `app/staff-auth.ts`. Review that allowlist before running your own instance. Customer ordering is public, but requires an item catalog and a workstation designated for online intake.

This project uses Vinext, Cloudflare Workers, and a D1 database. Run with Node.js 22.13 or newer:

```bash
npm ci
npm run build
npm run dev
```

The D1 schema is in `drizzle/`; apply migrations in numerical order when setting up a fresh database. Deployment through Sites uses `.openai/hosting.json` and its configured D1 binding. Hosted sign-in headers are provided by Sites; a standalone deployment needs an equivalent trusted authentication boundary before staff access can work.

## First use

1. Sign in to the staff workspace.
2. Add a workstation, describe its action, and place it on the floor.
3. Add items to the catalog and receive stock at a workstation.
4. Select an online intake workstation to enable customer orders.
5. Process orders by marking each station step done, handing items to another station when needed, and finishing the item.
