# Container Load Planning MCP Server

[![npm](https://img.shields.io/npm/v/loadingmcp-mcp)](https://www.npmjs.com/package/loadingmcp-mcp)

**Plan container & truck loads across 200+ equipment types from Claude, Cursor, or any MCP client.**

LoadingMCP is a container load-planning MCP server that lets an AI assistant compute 3D load plans, right-size the container mix, and check that a load is legal and safe to ship. It covers **200+ equipment types** (containers, trucks, ULDs, pallets) and returns volume & payload utilization, centre of gravity, crush & securing checks, VGM, axle load, and CTU/IMDG compliance signals. It runs as a hosted remote server, so there is nothing to self-host.

Ask your AI: *"Plan a 40HC load for these pallets"* or *"What's the cheapest container mix for 48 m³ at 19 t?"*

## Coverage

- **200+ equipment types** — 20'/40'/45' containers, high cubes, reefers, open-tops, flat-racks, box/curtain-side trucks, air ULDs, and standard pallets — each with internal dimensions (mm) and max payload (kg)
- **3D bin-packing engine** — real placement, not a volume guess. Drums and pipes hex-nest; big bags and sacks load on top and are never crushed; hazmat classes drive IMDG segregation
- **Compliance & safety** — volume + payload utilization %, centre of gravity, crush-protection violations, securing/bracing checklist, VGM, and axle-load figures
- **Right-sizing** — auto-selects the cheapest container/truck that fits when you don't name one

Sister product to [TrackingMCP](https://trackingmcp.com) (ocean container tracking) and [SchedulesMCP](https://schedulesmcp.com) (sailing schedules & reliability).

## Run your own copy (forks)

The hosted `mcp.loadingmcp.com` belongs to the upstream project, so a fork has to run its own server. The demo key needs no upstream API, so everything below works out of the box.

- **Quick test, no account:** Actions tab -> **Test run** -> *Run workflow*. It starts the server, smoke-tests it and prints a temporary `https://<random>.trycloudflare.com/mcp` URL in the log (open for 20 min by default). Use it with `Authorization: Bearer lmcp_demo_public`.
- **Permanent hosting (Fly.io):** `fly apps create <unique-name>`, then add repo secret `FLY_API_TOKEN` (`fly tokens create deploy -a <unique-name>`) and repo variable `FLY_APP=<unique-name>`. The **Deploy** workflow then ships every push to `main` to `https://<unique-name>.fly.dev/mcp`.
- **Locally:** `bun install && bun start`, then `scripts/smoke.sh`.
- Real API keys call `LOADINGMCP_API_URL` (default `https://loadingmcp-api.fly.dev`); override it with that env var if you run your own backend.

## Tools

| Tool | What it does |
|------|-------------|
| `list_equipment` | List the container, truck, ULD, and pallet types LoadingMCP can plan into, with internal dimensions (mm) and max payload (kg). |
| `suggest_containers` | Quick volume + weight estimate of how many of which container to use, given total cargo volume (m³) and weight (kg). |
| `plan_load` | Compute a 3D load plan: equipment used, utilization (volume & payload %), centre of gravity, crush-protection violations, and a securing checklist. Cargo `type` drives realism (drums/pipes hex-nest, big bags load on top). Omit the equipment code to auto right-size. |
| `export_plan` | Export a machine-readable loading work order: numbered stuffing sequence (which SKU, where, in what order and orientation), securing/bracing actions, declarable VGM / axle / CoG figures, and an optional retailer (Amazon FBA / Walmart) inbound-packaging check. |

## Quick connect

The server is hosted at `https://mcp.loadingmcp.com/mcp`. Try it with **zero signup** using the public demo key `lmcp_demo_public` (clearly-labelled synthetic plans from the offline preview packer). A real API key runs the full 200+ equipment catalogue and the production PackingSolver optimizer.

### Claude Desktop

```json
{
  "mcpServers": {
    "container-loading": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://mcp.loadingmcp.com/mcp",
               "--header", "Authorization: Bearer lmcp_demo_public"]
    }
  }
}
```

### Cursor / Windsurf / VS Code (native HTTP MCP)

```json
{
  "mcpServers": {
    "container-loading": {
      "url": "https://mcp.loadingmcp.com/mcp",
      "headers": { "Authorization": "Bearer lmcp_demo_public" }
    }
  }
}
```

Replace `lmcp_demo_public` with a key from [loadingmcp.com/mcp](https://loadingmcp.com/mcp). Don't add `"type": "streamable-http"` — Claude Desktop rejects unknown config fields; Cursor/Windsurf infer transport from `url`. Registry ID: `io.github.lxxmng/container-loading`.

## Example prompts

- *"Plan a 40HC load for these pallets."*
- *"What's the cheapest container mix for 48 m³ at 19 t?"*
- *"Right-size a container for 120 drums of 200 L each."*
- *"Check the centre of gravity and axle load for this truck load."*
- *"Which equipment types can hold a 12 m pipe bundle?"*
- *"Export a stuffing sequence and VGM for this 40' load."*

## Truthfulness

Demo output is synthetic and clearly labelled. `export_plan` is decision support to help you MEET published retailer/carrier specs — verify in your own portal; it is not a retailer certification.

## Links

- Product: [loadingmcp.com](https://loadingmcp.com)
- Get an API key: [loadingmcp.com/mcp](https://loadingmcp.com/mcp)

## License

MIT
