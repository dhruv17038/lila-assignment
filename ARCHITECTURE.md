# Architecture

## Live URL
**Frontend:** https://lila-assignment.vercel.app  
**Backend API:** https://lila-assignment-production.up.railway.app

---

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | React + Vite | Fast dev loop, component model fits interactive UI well |
| Visualization | SVG (inline) + Canvas (heatmap) | SVG gives precise per-event control; Canvas handles density of heatmap blobs efficiently |
| Backend | FastAPI (Python) | Pandas/PyArrow are the natural fit for parquet; FastAPI is lightweight and fast to write |
| Data format | Parquet (via PyArrow) | Source format — read directly, no conversion step |
| Frontend hosting | Vercel | Zero-config Vite deploys, instant CDN |
| Backend hosting | Railway | Simple GitHub-connected Python deploys with persistent process (needed since data loads at startup) |

---

## Data Flow

```
player_data/ (parquet files)
        ↓
FastAPI startup → load_all_data()
  - Reads all .nakama-0 files via PyArrow
  - Parses user_id from filename (first segment before underscore)
  - Decodes event bytes → UTF-8 strings
  - Detects bots: user_id matches /^\d+$/ (pure numeric = bot)
  - Normalizes timestamps: per-match elapsed seconds from match start
  - Concatenates into single in-memory DataFrame (~89K rows)
        ↓
REST API endpoints
  GET /maps       → unique map_id values
  GET /dates      → unique day folder names
  GET /matches    → match_ids filtered by map + date
  GET /match_data → all rows for a match_id, sorted by ts
        ↓
React frontend (Vercel)
  - Axios fetches on user selection
  - worldToCanvas() maps game coords → SVG pixel coords
  - SVG renders paths + event markers
  - Canvas renders heatmap blobs
  - Timeline slider filters data by elapsed time
```

---

## Coordinate Mapping

This was the trickiest part. The game uses a 3D world coordinate system (x, y, z) where z is the horizontal axis (not y). The minimap images are 2D top-down views.

**Approach:** I empirically derived scale and origin values per map by cross-referencing kill/death event clusters with visible map landmarks (buildings, roads, chokepoints).

```javascript
const MAP_CONFIG = {
  AmbroseValley: { scale: 900,  originX: -370, originZ: -473 },
  GrandRift:     { scale: 581,  originX: -290, originZ: -290 },
  Lockdown:      { scale: 1000, originX: -500, originZ: -500 },
};

function worldToCanvas(x, z, mapId) {
  const cfg = MAP_CONFIG[mapId];
  const u = (x - cfg.originX) / cfg.scale;   // 0..1 left→right
  const v = (z - cfg.originZ) / cfg.scale;   // 0..1 but Y-flipped
  return {
    cx: u * SIZE,
    cy: (1 - v) * SIZE,   // flip vertical: game +Z = map top
  };
}
```

The Y-axis flip is necessary because game world +Z points "up" on the map but SVG/canvas +Y points downward.

---

## Assumptions Made

| Ambiguity | Assumption |
|---|---|
| Bot detection | User IDs that are pure integers (e.g. `1382`) are bots; UUID-format IDs are humans |
| Timestamp format | Raw `ts` values are milliseconds since epoch as int64; normalized to elapsed seconds per match |
| Coordinate mapping | Derived empirically — no ground truth provided in README |
| match_id | Taken from the parquet column (includes `.nakama-0` suffix), not the filename, so all players in a match share the same ID |
| map assignment | Taken from `map_id` column in parquet data |

---

## Major Tradeoffs

| Decision | Considered | Chose | Reason |
|---|---|---|---|
| Data loading | Load on request vs load at startup | Load at startup | 89K rows fits in memory; per-request parquet reads would be too slow |
| Rendering | Canvas vs SVG vs WebGL | SVG for events/paths, Canvas for heatmap | SVG is easier to reason about for discrete markers; Canvas handles heatmap density better |
| Backend hosting | Render vs Railway vs Fly.io | Railway | Simplest GitHub integration; free tier works for this data size |
| Coordinate mapping | README-provided vs empirical | Empirical | README described the system but didn't give origin/scale values |
| Frontend state | Redux vs local useState | useState | App state is simple enough; no cross-component complexity that needs a store |