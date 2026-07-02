/**
 * LoadingMCP MCP Server — container & truck load planning for AI clients.
 *
 * Remote Streamable HTTP server at https://mcp.loadingmcp.com/mcp
 * Generate your API key at https://loadingmcp.com/mcp.
 *
 * Same connection pattern as TrackingMCP / SchedulesMCP (mcp-remote stdio bridge for Claude
 * Desktop, native HTTP for Cursor/Windsurf). Do NOT add "type": "streamable-http" — Claude
 * Desktop rejects unknown config fields.
 *
 * Auth: a public demo key (lmcp_demo_public) returns synthetic data with no signup. A real key
 * is validated by the API and runs the production PackingSolver optimizer behind the paid
 * `loading` entitlement.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { z } from 'zod'

const PORT = Number.parseInt(process.env.MCP_PORT ?? '3002')
const DEMO_KEY = process.env.MCP_DEMO_API_KEY ?? 'lmcp_demo_public'
// Hosted API that runs the real PackingSolver behind the paid `loading` entitlement.
const API_URL = process.env.LOADINGMCP_API_URL ?? 'https://loadingmcp-api.fly.dev'

// ── Synthetic demo equipment library — realistic-looking, zero real org data ──
// Internal dimensions (mm) and max payload (kg) for common ISO containers, a road trailer,
// an air ULD and a Euro pallet. Numbers are representative standard specs.
const DEMO_EQUIPMENT: Array<{
  code: string
  name: string
  category: 'container' | 'truck' | 'uld' | 'pallet'
  innerLengthMm: number
  innerWidthMm: number
  innerHeightMm: number
  maxPayloadKg: number
  reefer: boolean
}> = [
  {
    code: '20GP',
    name: "20' General Purpose",
    category: 'container',
    innerLengthMm: 5898,
    innerWidthMm: 2352,
    innerHeightMm: 2393,
    maxPayloadKg: 28180,
    reefer: false,
  },
  {
    code: '40GP',
    name: "40' General Purpose",
    category: 'container',
    innerLengthMm: 12032,
    innerWidthMm: 2352,
    innerHeightMm: 2393,
    maxPayloadKg: 26680,
    reefer: false,
  },
  {
    code: '40HC',
    name: "40' High Cube",
    category: 'container',
    innerLengthMm: 12032,
    innerWidthMm: 2352,
    innerHeightMm: 2698,
    maxPayloadKg: 26460,
    reefer: false,
  },
  {
    code: '45HC',
    name: "45' High Cube",
    category: 'container',
    innerLengthMm: 13556,
    innerWidthMm: 2352,
    innerHeightMm: 2698,
    maxPayloadKg: 25600,
    reefer: false,
  },
  {
    code: 'TRL136',
    name: '13.6m Curtain-side Road Trailer',
    category: 'truck',
    innerLengthMm: 13620,
    innerWidthMm: 2480,
    innerHeightMm: 2700,
    maxPayloadKg: 24000,
    reefer: false,
  },
  {
    code: 'AKE',
    name: 'AKE / LD3 Air ULD',
    category: 'uld',
    innerLengthMm: 1534,
    innerWidthMm: 1562,
    innerHeightMm: 1520,
    maxPayloadKg: 1134,
    reefer: false,
  },
  {
    code: 'EUR',
    name: 'EUR / EPAL Pallet',
    category: 'pallet',
    innerLengthMm: 1200,
    innerWidthMm: 800,
    innerHeightMm: 144,
    maxPayloadKg: 1500,
    reefer: false,
  },
]

function listDemoEquipment(category?: 'container' | 'truck' | 'uld' | 'pallet') {
  return category ? DEMO_EQUIPMENT.filter((e) => e.category === category) : DEMO_EQUIPMENT
}

async function apiGet(path: string, apiKey: string) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  return res.json()
}

async function apiPost(path: string, apiKey: string, body: unknown) {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  })
  return res.json()
}

/** Wrap a JSON value as an MCP text result. */
function textResult(obj: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(obj, null, 2) }] }
}

// Shared cargo-item schema for plan_load / export_plan.
const cargoItemSchema = z.object({
  id: z.string().describe('Your reference for this cargo line'),
  type: z
    .enum(['box', 'pallet', 'drum', 'cylinder', 'bigbag', 'roll', 'sack'])
    .default('box')
    .describe('Cargo shape: drum/cylinder/roll hex-nest; bigbag/sack load on top, never crushed'),
  length: z.number().describe('mm'),
  width: z.number().describe('mm'),
  height: z.number().describe('mm'),
  weight: z.number().describe('kg per unit'),
  quantity: z.number().int().positive().default(1),
  stackable: z.boolean().default(true).describe('Whether anything may be stacked on top'),
  refrigerated: z.boolean().default(false).describe('Needs the cold chain (reefer only)'),
  hazmatClass: z
    .string()
    .optional()
    .describe(
      'IMDG dangerous-goods class (e.g. "3", "5.1") — drives 7.2.4 segregation. Omit for non-hazardous.'
    ),
  maxStackWeightKg: z
    .number()
    .nonnegative()
    .optional()
    .describe(
      'Your crush limit: max kg allowed on top of one unit. Omit for a generous default; 0 = nothing may stack on it.'
    ),
  boardEctLbIn: z
    .number()
    .positive()
    .optional()
    .describe('Corrugated edge-crush test (lb/in) → physical McKee crush limit for cartons'),
  boardCaliperMm: z.number().positive().optional().describe('Corrugated board thickness (mm)'),
  doubleWall: z.boolean().optional().describe('Double-wall corrugated (vs single)'),
})

function buildServer(apiKey: string) {
  const isDemo = apiKey === DEMO_KEY
  const server = new McpServer({ name: 'container-loading', version: '0.1.0' })

  server.tool(
    'list_equipment',
    'List the standard container, truck, ULD and pallet types LoadingMCP can plan loads into, with internal dimensions (mm) and max payload (kg).',
    {
      category: z
        .enum(['container', 'truck', 'uld', 'pallet'])
        .optional()
        .describe('Optional category filter'),
    },
    async ({ category }) => {
      if (isDemo) {
        return textResult({
          equipment: listDemoEquipment(category),
          note: 'Demo equipment library (synthetic representative specs) — a real API key returns the full 200+ equipment catalogue from loadingmcp.com.',
        })
      }
      const query = category ? `?category=${category}` : ''
      const data = await apiGet(`/v1/equipment${query}`, apiKey)
      return textResult(data)
    }
  )

  server.tool(
    'suggest_containers',
    'Given total cargo volume (m³) and weight (kg), suggest how many of which container to use — a quick volume/weight estimate. For an exact, dimension-aware plan with utilization, CoG and securing, use plan_load (which can also auto right-size).',
    {
      volumeM3: z.number().describe('Total cargo volume in cubic metres'),
      weightKg: z.number().describe('Total cargo weight in kilograms'),
    },
    async ({ volumeM3, weightKg }) => {
      if (isDemo) {
        // 40HC ≈ 76.3 m³ usable, 26.46 t payload.
        const byVolume = Math.ceil(volumeM3 / 76.3)
        const byWeight = Math.ceil(weightKg / 26460)
        const count = Math.max(byVolume, byWeight, 1)
        return textResult({
          suggestion: `${count} x 40HC`,
          limited_by: byWeight > byVolume ? 'weight' : 'volume',
          note: 'Quick volume/weight estimate (synthetic demo) — call plan_load for an exact dimension-aware plan.',
        })
      }
      const data = await apiPost('/v1/suggest', apiKey, { volumeM3, weightKg })
      return textResult(data)
    }
  )

  server.tool(
    'plan_load',
    'Compute a 3D load plan for cargo into a container or truck: containers used, utilization (volume & payload %), centre of gravity, crush-protection violations, and a securing checklist (round cargo that rolls, soft cargo that slumps). Cargo `type` drives realism — drums/pipes hex-nest, big bags/sacks load on top and are never crushed. Omit `equipmentCode` to auto right-size to the cheapest container that fits. A real API key runs the production PackingSolver optimizer; the public demo key uses the offline preview packer.',
    {
      equipmentCode: z
        .string()
        .optional()
        .describe('Equipment code, e.g. 40HC (see list_equipment). Omit to auto right-size.'),
      mode: z
        .enum(['sea', 'road', 'air'])
        .default('sea')
        .describe(
          'Transport mode — scopes auto right-size to usable equipment (sea→containers, road→trucks, air→ULDs). Ignored when equipmentCode is given.'
        ),
      items: z.array(cargoItemSchema).describe('Cargo lines to load'),
      vgm: z
        .object({
          declaredKg: z
            .array(z.number().nonnegative())
            .optional()
            .describe(
              'Shipper-declared SOLAS VGM per container (kg), index-aligned to containers used'
            ),
          method: z
            .enum(['M1', 'M2'])
            .optional()
            .describe(
              'VGM method: M1 = weighbridge of the packed container, M2 = certified calculated sum'
            ),
          dunnageKg: z
            .number()
            .nonnegative()
            .optional()
            .describe('Dunnage/securing mass (kg) to fold into the calculated VGM estimate'),
        })
        .optional()
        .describe('SOLAS Verified Gross Mass declaration (else a tare+cargo estimate is reported)'),
    },
    async ({ equipmentCode, mode, items, vgm }) => {
      if (!isDemo) {
        const data = await apiPost('/v1/plan', apiKey, {
          ...(equipmentCode ? { equipmentCode } : { mode }),
          items,
          ...(vgm ? { options: { vgm } } : {}),
        })
        return textResult(data)
      }

      // ── Demo: synthetic dimension-aware plan ────────────────────────────────
      const totalUnits = items.reduce((n, i) => n + i.quantity, 0)
      const totalVolumeM3 =
        items.reduce(
          (v, i) => v + (i.length * i.width * i.height * i.quantity) / 1_000_000_000,
          0
        ) || 0
      const totalWeightKg = items.reduce((w, i) => w + i.weight * i.quantity, 0)
      const needsReefer = items.some((i) => i.refrigerated)

      // Pick a plausible equipment: explicit, else cheapest by mode that "fits" by volume.
      const pool = listDemoEquipment(
        mode === 'road' ? 'truck' : mode === 'air' ? 'uld' : 'container'
      )
      let chosen = equipmentCode
        ? DEMO_EQUIPMENT.find((e) => e.code === equipmentCode.toUpperCase())
        : pool[0]
      if (equipmentCode && !chosen) return textResult({ error: 'unknown_equipment', equipmentCode })
      if (!chosen) chosen = pool[0] ?? DEMO_EQUIPMENT[0]

      const usableVolM3 =
        (chosen.innerLengthMm * chosen.innerWidthMm * chosen.innerHeightMm) / 1_000_000_000
      // Assume ~85% practical packing efficiency for the synthetic estimate.
      const byVolume = Math.ceil(totalVolumeM3 / (usableVolM3 * 0.85)) || 1
      const byWeight = Math.ceil(totalWeightKg / chosen.maxPayloadKg) || 1
      const containersUsed = Math.max(byVolume, byWeight, 1)

      const volumeUtilPct =
        Math.round((totalVolumeM3 / (usableVolM3 * containersUsed)) * 1000) / 10
      const payloadUtilPct =
        Math.round((totalWeightKg / (chosen.maxPayloadKg * containersUsed)) * 1000) / 10

      const securing: Array<{ level: string; action: string; detail: string }> = []
      if (items.some((i) => i.type === 'drum' || i.type === 'cylinder' || i.type === 'roll')) {
        securing.push({
          level: 'required',
          action: 'Chock & lash rolling cargo',
          detail: 'Round units (drums/cylinders/rolls) hex-nested; wedge and lash to stop roll in transit.',
        })
      }
      if (items.some((i) => i.type === 'bigbag' || i.type === 'sack')) {
        securing.push({
          level: 'advisory',
          action: 'Load soft cargo on top',
          detail: 'Big bags / sacks placed last, never crushed; interlock to limit slump.',
        })
      }
      securing.push({
        level: 'advisory',
        action: 'Fill voids & brace door end',
        detail: 'Dunnage the last-tier voids and brace the door end to prevent shift.',
      })

      return textResult({
        equipmentCode: chosen.code,
        autoSized: !equipmentCode,
        engine: 'offline-preview',
        containersUsed,
        placedUnits: totalUnits,
        limitedBy: byWeight > byVolume ? 'weight' : 'volume',
        reeferUsed: needsReefer,
        metrics: {
          volumeUtilPct,
          payloadUtilPct,
          usedWeightKg: totalWeightKg,
          usedVolumeM3: Math.round(totalVolumeM3 * 100) / 100,
          // Synthetic centre-of-gravity offset from geometric centre (%), well within tolerance.
          cogOffsetPct: { x: 3, y: 2 },
          crushViolations: 0,
          unplaced: 0,
        },
        violations: [],
        securingRequired: securing.some((s) => s.level === 'required'),
        securing,
        note: 'Demo plan (synthetic) — a real API key runs the production PackingSolver optimizer at loadingmcp.com',
      })
    }
  )

  server.tool(
    'export_plan',
    'Export a load as a machine-readable LOADING WORK ORDER: a numbered stuffing sequence (which SKU, where, in what order and orientation), the securing/bracing action list, the key declarable figures (VGM, axle load, centre of gravity), and an optional per-retailer inbound-packaging check (Amazon FBA / Walmart). Feed it to a WES/TMS, a robotic palletiser, or a printable worker sheet. This is decision support to MEET published retailer/carrier specs — verify in your own portal; it is not a retailer certification.',
    {
      equipmentCode: z
        .string()
        .optional()
        .describe('Equipment code, e.g. 40HC (see list_equipment). Omit to auto right-size.'),
      mode: z
        .enum(['sea', 'road', 'air'])
        .default('sea')
        .describe('Transport mode for auto right-size (ignored when equipmentCode is given).'),
      retailers: z
        .array(z.enum(['AMAZON_FBA', 'WALMART_STORES', 'WALMART_WFS', 'GENERIC_GMA']))
        .optional()
        .describe('Retailer inbound-packaging profiles to check the load against.'),
      items: z
        .array(
          z.object({
            id: z.string().describe('Your reference for this cargo line'),
            type: z
              .enum(['box', 'pallet', 'drum', 'cylinder', 'bigbag', 'roll', 'sack'])
              .default('box'),
            length: z.number().describe('mm'),
            width: z.number().describe('mm'),
            height: z.number().describe('mm'),
            weight: z.number().describe('kg per unit'),
            quantity: z.number().int().positive().default(1),
            stackable: z.boolean().default(true),
            hazmatClass: z
              .string()
              .optional()
              .describe('IMDG class (e.g. "3", "5.1"); omit if none'),
            maxStackWeightKg: z.number().nonnegative().optional(),
          })
        )
        .describe('Cargo lines to load'),
    },
    async ({ equipmentCode, mode, retailers, items }) => {
      if (!isDemo) {
        const data = await apiPost('/v1/export', apiKey, {
          ...(equipmentCode ? { equipmentCode } : { mode }),
          ...(retailers ? { retailers } : {}),
          items,
        })
        return textResult(data)
      }

      // ── Demo: synthetic loading work order ──────────────────────────────────
      const pool = listDemoEquipment(
        mode === 'road' ? 'truck' : mode === 'air' ? 'uld' : 'container'
      )
      let chosen = equipmentCode
        ? DEMO_EQUIPMENT.find((e) => e.code === equipmentCode.toUpperCase())
        : pool[0]
      if (equipmentCode && !chosen) return textResult({ error: 'unknown_equipment', equipmentCode })
      if (!chosen) chosen = pool[0] ?? DEMO_EQUIPMENT[0]

      const totalWeightKg = items.reduce((w, i) => w + i.weight * i.quantity, 0)
      // Heaviest / non-stackable first (floor), lightest / soft last (top).
      const rank = (t: string) =>
        t === 'bigbag' || t === 'sack' ? 2 : t === 'pallet' || t === 'box' ? 1 : 0
      const ordered = [...items].sort((a, b) => rank(a.type) - rank(b.type) || b.weight - a.weight)
      const stuffingSequence = ordered.map((i, idx) => ({
        step: idx + 1,
        cargoId: i.id,
        type: i.type,
        quantity: i.quantity,
        orientation:
          i.type === 'drum' || i.type === 'cylinder'
            ? 'upright, hex-nested'
            : 'longest edge fore-aft',
        placement:
          rank(i.type) === 2
            ? 'top tier — load last, do not crush'
            : idx === 0
              ? 'floor, against front wall'
              : 'floor, working toward the door',
      }))

      const securingActions = [
        'Block & brace floor tier against the front wall.',
        'Fill inter-row voids with dunnage/airbags.',
        'Lash any rolling cargo (drums/cylinders/rolls); wedge to stop roll.',
        'Brace the door end before sealing.',
      ]

      const retailerChecks = (retailers ?? []).map((r) => ({
        retailer: r,
        result: 'not_evaluated',
        note: 'Retailer inbound-packaging profiles are checked by the production engine with a real API key.',
      }))

      // Estimated VGM = cargo + representative tare for the chosen equipment.
      const tareKg =
        chosen.category === 'container'
          ? chosen.code.startsWith('20')
            ? 2300
            : 3900
          : chosen.category === 'truck'
            ? 7000
            : 100
      return textResult({
        workOrder: {
          equipmentCode: chosen.code,
          equipmentName: chosen.name,
          autoSized: !equipmentCode,
          stuffingSequence,
          securingActions,
          declarations: {
            vgm: {
              estimatedKg: totalWeightKg + tareKg,
              method: 'M2-estimate',
              note: 'Calculated cargo + representative tare — declare your own weighbridge/certified VGM.',
            },
            axleLoadNote:
              chosen.category === 'truck'
                ? 'Confirm axle distribution on a weighbridge before dispatch.'
                : 'Axle load not applicable to this equipment.',
            centreOfGravityPct: { x: 3, y: 2, note: 'Offset from geometric centre — within tolerance.' },
          },
          retailerChecks,
        },
        note: 'Demo work order (synthetic) — decision support to MEET published retailer/carrier specs; verify in your own portal, it is not a retailer certification. A real API key runs the production PackingSolver optimizer at loadingmcp.com.',
      })
    }
  )

  return server
}

// ── HTTP transport (Streamable HTTP) ──────────────────────────────────────────
const handler = async (req: Request): Promise<Response> => {
  const url = new URL(req.url)
  if (url.pathname === '/health') return new Response('ok', { status: 200 })
  if (url.pathname !== '/mcp') return new Response('Not found', { status: 404 })

  const authHeader = req.headers.get('Authorization')
  const apiKey = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : DEMO_KEY

  const server = buildServer(apiKey)
  const transport = new WebStandardStreamableHTTPServerTransport()
  await server.connect(transport)
  return transport.handleRequest(req)
}

Bun.serve({ port: PORT, fetch: handler })
console.log(`loadingmcp-mcp listening on :${PORT}`)
