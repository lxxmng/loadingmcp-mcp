# LoadingMCP — Container & Truck Load-Planning MCP Server

Plan **optimal container and truck loads** straight from your AI client (Claude, Cursor,
Windsurf, or any MCP client): 3D load plans, right-sizing to the cheapest equipment that fits,
volume and payload utilization, centre of gravity, crush & securing checks, VGM / axle figures,
and per-retailer inbound-packaging checks.

A sister product to [TrackingMCP](https://trackingmcp.com) and
[SchedulesMCP](https://schedulesmcp.com). Load plans come from a real bin-packing engine —
drums and pipes hex-nest, big bags and sacks load on top and are never crushed, hazmat classes
drive IMDG segregation.

This repo is the **public MCP server** for [loadingmcp.com](https://loadingmcp.com). It runs as a
remote Streamable HTTP server; you don't need to host it. Use the public demo key to try it with
no signup.

## Tools

| Tool | What it does |
|---|---|
| `list_equipment` | List container / truck / ULD / pallet types with internal dimensions (mm) and max payload (kg) |
| `suggest_containers` | Quick volume + weight estimate of how many of which container to use |
| `plan_load` | 3D load plan: equipment used, utilization %, centre of gravity, crush violations, securing checklist (auto right-sizes when no equipment is given) |
| `export_plan` | Machine-readable loading work order: numbered stuffing sequence, securing actions, VGM / axle / CoG figures, optional retailer (Amazon FBA / Walmart) checks |

For 200+ equipment types and the production PackingSolver optimizer, use a real API key from
[loadingmcp.com/mcp](https://loadingmcp.com/mcp). The public demo key returns clearly-labelled
synthetic plans from an offline preview packer.

## Connect

### Claude Desktop
```json
{
  "mcpServers": {
    "container-loading": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://mcp.loadingmcp.com/mcp",
               "--header", "Authorization: Bearer YOUR_API_KEY"]
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
      "headers": { "Authorization": "Bearer YOUR_API_KEY" }
    }
  }
}
```

Replace `YOUR_API_KEY` with a key from [loadingmcp.com/mcp](https://loadingmcp.com/mcp), or use the
public demo key `lmcp_demo_public` for synthetic demo load plans (no signup). Don't add
`"type": "streamable-http"` — Claude Desktop rejects unknown config fields; Cursor/Windsurf infer
transport from `url`.

## Truthfulness

Demo output is synthetic and clearly labelled. `export_plan` is decision support to help you MEET
published retailer/carrier specs — verify in your own portal; it is not a retailer certification.

## Endpoint

- Remote: `https://mcp.loadingmcp.com/mcp`
- Health: `https://mcp.loadingmcp.com/health`

## Links

- [loadingmcp.com](https://loadingmcp.com)
- [loadingmcp.com/mcp](https://loadingmcp.com/mcp)

## License

MIT
