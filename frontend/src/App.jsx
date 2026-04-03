import { useEffect, useState, useRef } from "react";
import axios from "axios";

const MAP_CONFIG = {
  AmbroseValley: { scale: 900,  originX: -370, originZ: -473 },
  GrandRift:     { scale: 581,  originX: -290, originZ: -290 },
  Lockdown:      { scale: 1000, originX: -500, originZ: -500 },
};

const EVENT_COLORS = {
  Kill:          "#ff4444",
  Killed:        "#ff8800",
  BotKill:       "#ff44aa",
  BotKilled:     "#aa44ff",
  KilledByStorm: "#00ccff",
  Loot:          "#44ff88",
};

const EVENT_SYMBOLS = {
  Kill: "✕", Killed: "☠", BotKill: "✕", BotKilled: "☠",
  KilledByStorm: "⚡", Loot: "◆",
};

function getColor(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return `hsl(${Math.abs(hash) % 360}, 80%, 60%)`;
}

const SIZE = 600;

function worldToCanvas(x, z, mapId) {
  const cfg = MAP_CONFIG[mapId];
  if (!cfg) return { cx: 0, cy: 0 };
  const u = (x - cfg.originX) / cfg.scale;
  const v = (z - cfg.originZ) / cfg.scale;
  return {
    cx: u * SIZE,
    cy: (1 - v) * SIZE,
  };
}

const selectStyle = {
  background: "#1a1a2e", color: "#e0e0ff", border: "1px solid #444",
  borderRadius: "6px", padding: "6px 10px", fontSize: "13px"
};

const btnStyle = {
  background: "#2d2d4e", color: "#e0e0ff", border: "1px solid #555",
  borderRadius: "6px", padding: "6px 12px", cursor: "pointer", fontSize: "13px"
};

const BASE_URL = "https://lila-assignment-5vud.onrender.com";

export default function App() {
  const [maps, setMaps] = useState([]);
  const [selectedMap, setSelectedMap] = useState("");

  const [dates, setDates] = useState([]);
  const [selectedDate, setSelectedDate] = useState("");

  const [matches, setMatches] = useState([]);
  const [selectedMatch, setSelectedMatch] = useState("");
  const [matchData, setMatchData] = useState([]);
  const [loading, setLoading] = useState(false);

  const [showHumans, setShowHumans]   = useState(true);
  const [showBots, setShowBots]       = useState(true);
  const [showPaths, setShowPaths]     = useState(true);
  const [showEvents, setShowEvents]   = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [heatmapType, setHeatmapType] = useState("kills");

  const [time, setTime]               = useState(0);
  const [playing, setPlaying]         = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState("ALL");

  const heatCanvasRef = useRef(null);

  // Load maps on mount
  useEffect(() => {
    axios.get(`${BASE_URL}/maps`).then(r => setMaps(r.data));
  }, []);

  // Load dates when map is selected
  useEffect(() => {
    if (!selectedMap) return;
    axios.get(`${BASE_URL}/dates`).then(r => setDates(r.data));
    // Reset downstream
    setSelectedDate("");
    setMatches([]);
    setSelectedMatch("");
    setMatchData([]);
    setTime(0);
  }, [selectedMap]);

  // Load matches when map or date changes
  useEffect(() => {
    if (!selectedMap) return;
    const url = selectedDate
      ? `${BASE_URL}/matches?map_id=${selectedMap}&date=${selectedDate}`
      : `${BASE_URL}/matches?map_id=${selectedMap}`;
    axios.get(url).then(r => {
      setMatches(r.data);
      setSelectedMatch("");
      setMatchData([]);
      setTime(0);
    });
  }, [selectedMap, selectedDate]);

  const loadMatches = (map) => {
    setSelectedMap(map);
  };

  const loadMatchData = (match) => {
    setSelectedMatch(match);
    setLoading(true);
    setMatchData([]);
    setTime(0);
    setPlaying(false);
    setSelectedPlayer("ALL");
    axios.get(`${BASE_URL}/match_data?match_id=${match}`)
      .then(r => {
        setMatchData(r.data);
        setLoading(false);
      });
  };

  const cleanData = matchData
    .filter(p => p && p.x != null && p.z != null && p.ts != null)
    .map(p => ({ ...p, tsMs: Number(p.ts) }))
    .sort((a, b) => a.tsMs - b.tsMs);

  const minTs = cleanData.length ? cleanData[0].tsMs : 0;
  const maxTs = cleanData.length ? cleanData[cleanData.length - 1].tsMs : 0;

  // Set time to max when new match loads
  useEffect(() => {
    if (cleanData.length > 0) {
      setTime(cleanData[cleanData.length - 1].tsMs);
    }
  }, [matchData]);

  // Playback
  useEffect(() => {
    if (!playing) return;
    const range = maxTs - minTs;
    const step = Math.max(0.001, range / 400);
    const interval = setInterval(() => {
      setTime(prev => {
        if (prev >= maxTs) { setPlaying(false); return maxTs; }
        return prev + step;
      });
    }, 50);
    return () => clearInterval(interval);
  }, [playing, minTs, maxTs]);

  const playerIds = [...new Set(cleanData.map(p => p.user_id))];
  const humanIds  = playerIds.filter(id => !/^\d+$/.test(id));
  const botIds    = playerIds.filter(id => /^\d+$/.test(id));

  const visibleData = cleanData.filter(p => {
    if (p.tsMs > time) return false;
    const isBot = /^\d+$/.test(p.user_id);
    if (isBot && !showBots) return false;
    if (!isBot && !showHumans) return false;
    if (selectedPlayer !== "ALL" && p.user_id !== selectedPlayer) return false;
    return true;
  });

  const events = visibleData.filter(
    p => p.event && !["Position", "BotPosition"].includes(p.event)
  );

  const pathsByPlayer = {};
  visibleData
    .filter(p => p.event === "Position" || p.event === "BotPosition")
    .forEach(p => {
      if (!pathsByPlayer[p.user_id]) pathsByPlayer[p.user_id] = [];
      pathsByPlayer[p.user_id].push(p);
    });

  // Heatmap
  useEffect(() => {
    if (!heatCanvasRef.current) return;
    const canvas = heatCanvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, SIZE, SIZE);
    if (!showHeatmap || !cleanData.length) return;

    let pts = [];
    if (heatmapType === "kills")
      pts = cleanData.filter(p => ["Kill", "BotKill"].includes(p.event));
    else if (heatmapType === "deaths")
      pts = cleanData.filter(p => ["Killed", "BotKilled", "KilledByStorm"].includes(p.event));
    else
      pts = cleanData.filter(p => ["Position", "BotPosition"].includes(p.event));

    pts.forEach(p => {
      const { cx, cy } = worldToCanvas(p.x, p.z, selectedMap);
      const radius = heatmapType === "traffic" ? 10 : 18;
      const color  = heatmapType === "kills"  ? "rgba(255,50,50,0.2)"
                   : heatmapType === "deaths" ? "rgba(255,150,0,0.2)"
                   : "rgba(0,200,255,0.04)";
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      grad.addColorStop(0, color);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
    });
  }, [showHeatmap, heatmapType, cleanData, selectedMap]);

  const formatTime = (val) => {
    if (minTs === 0 && maxTs === 0) return "0:00.000";
    const ms = Math.round((val - minTs) * 1000);
    const s = Math.floor(ms / 1000);
    const msDisplay = ms % 1000;
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}.${String(msDisplay).padStart(3, "0")}`;
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0d0d1a", color: "#e0e0ff", fontFamily: "sans-serif", padding: "16px" }}>
      <h1 style={{ textAlign: "center", margin: "0 0 16px", fontSize: "22px", color: "#a78bfa" }}>
        🎮 LILA BLACK — Player Journey Visualizer
      </h1>

      {/* SELECTORS ROW 1: Map + Date */}
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", justifyContent: "center", marginBottom: "10px" }}>
        <select style={selectStyle} onChange={e => loadMatches(e.target.value)} value={selectedMap}>
          <option value="">— Select Map —</option>
          {maps.map(m => <option key={m} value={m}>{m}</option>)}
        </select>

        <select
          style={selectStyle}
          value={selectedDate}
          onChange={e => setSelectedDate(e.target.value)}
          disabled={!selectedMap || !dates.length}
        >
          <option value="">— All Dates —</option>
          {dates.map(d => <option key={d} value={d}>{d.replace("_", " ")}</option>)}
        </select>
      </div>

      {/* SELECTORS ROW 2: Match + Player */}
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", justifyContent: "center", marginBottom: "16px" }}>
        <select
          style={{ ...selectStyle, maxWidth: "280px" }}
          onChange={e => loadMatchData(e.target.value)}
          value={selectedMatch}
          disabled={!matches.length}
        >
          <option value="">— Select Match ({matches.length} available) —</option>
          {matches.map(m => <option key={m} value={m}>{m.slice(0, 36)}</option>)}
        </select>

        <select
          style={selectStyle}
          value={selectedPlayer}
          onChange={e => setSelectedPlayer(e.target.value)}
          disabled={!playerIds.length}
        >
          <option value="ALL">All Players ({playerIds.length})</option>
          <optgroup label={`Humans (${humanIds.length})`}>
            {humanIds.map(id => <option key={id} value={id}>👤 {id.slice(0, 18)}…</option>)}
          </optgroup>
          <optgroup label={`Bots (${botIds.length})`}>
            {botIds.map(id => <option key={id} value={id}>🤖 Bot {id}</option>)}
          </optgroup>
        </select>
      </div>

      {/* TOGGLES */}
      <div style={{ display: "flex", gap: "16px", justifyContent: "center", flexWrap: "wrap", marginBottom: "12px", fontSize: "13px" }}>
        {[
          ["👤 Humans", showHumans, setShowHumans],
          ["🤖 Bots",   showBots,   setShowBots],
          ["〰 Paths",  showPaths,  setShowPaths],
          ["⚡ Events", showEvents, setShowEvents],
        ].map(([label, val, setter]) => (
          <label key={label} style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
            <input type="checkbox" checked={val} onChange={() => setter(!val)} />
            {label}
          </label>
        ))}
        <label style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
          <input type="checkbox" checked={showHeatmap} onChange={() => setShowHeatmap(!showHeatmap)} />
          🔥 Heatmap:
        </label>
        {showHeatmap && (
          <select
            style={{ ...selectStyle, fontSize: "12px", padding: "2px 6px" }}
            value={heatmapType}
            onChange={e => setHeatmapType(e.target.value)}
          >
            <option value="kills">Kill zones</option>
            <option value="deaths">Death zones</option>
            <option value="traffic">Traffic</option>
          </select>
        )}
      </div>

      {/* TIMELINE */}
      {cleanData.length > 0 && (
        <div style={{ textAlign: "center", marginBottom: "12px" }}>
          <button onClick={() => { setTime(minTs); setPlaying(true); }} style={btnStyle}>⏮ Restart</button>
          <button onClick={() => setPlaying(!playing)} style={{ ...btnStyle, margin: "0 8px" }}>
            {playing ? "⏸ Pause" : "▶ Play"}
          </button>
          <button onClick={() => setTime(maxTs)} style={btnStyle}>⏭ End</button>
          <div style={{ marginTop: "8px" }}>
            <input
              type="range" min={minTs} max={maxTs} step={(maxTs - minTs) / 1000}
              value={time}
              onChange={e => { setPlaying(false); setTime(Number(e.target.value)); }}
              style={{ width: "500px", maxWidth: "90vw" }}
            />
            <div style={{ fontSize: "13px", color: "#888", marginTop: "4px" }}>
              ⏱ {formatTime(time)} / {formatTime(maxTs)}
              &nbsp;|&nbsp; {Object.keys(pathsByPlayer).length} players visible
              &nbsp;|&nbsp; {events.length} events visible
            </div>
          </div>
        </div>
      )}

      {/* MAP CANVAS */}
      {selectedMap && (
        <div style={{
          position: "relative",
          width: SIZE,
          height: SIZE,
          margin: "0 auto",
          border: "1px solid #333",
          borderRadius: "8px",
          overflow: "hidden",
          background: "#111"
        }}>
          <img
            src={`/minimaps/${selectedMap}.png`}
            alt="minimap"
            style={{
              position: "absolute",
              top: 0, left: 0,
              width: "100%",
              height: "100%",
              objectFit: "fill",
              zIndex: 1
            }}
          />

          <canvas
            ref={heatCanvasRef}
            width={SIZE} height={SIZE}
            style={{ position: "absolute", top: 0, left: 0, zIndex: 2, opacity: showHeatmap ? 1 : 0 }}
          />

          <svg
            width={SIZE} height={SIZE}
            style={{ position: "absolute", top: 0, left: 0, zIndex: 3 }}
          >
            {/* PATHS */}
            {showPaths && Object.entries(pathsByPlayer).map(([playerId, pts]) => {
              const isBot  = /^\d+$/.test(playerId);
              const color  = isBot ? "#888888" : getColor(playerId);
              const pointsStr = pts.map(p => {
                const { cx, cy } = worldToCanvas(p.x, p.z, selectedMap);
                return `${cx.toFixed(1)},${cy.toFixed(1)}`;
              }).join(" ");
              return (
                <polyline
                  key={playerId}
                  points={pointsStr}
                  fill="none"
                  stroke={color}
                  strokeWidth={isBot ? 1 : 1.5}
                  strokeOpacity={isBot ? 0.35 : 0.8}
                  strokeLinejoin="round"
                />
              );
            })}

            {/* CURRENT POSITION DOTS */}
            {showPaths && Object.entries(pathsByPlayer).map(([playerId, pts]) => {
              const last = pts[pts.length - 1];
              if (!last) return null;
              const { cx, cy } = worldToCanvas(last.x, last.z, selectedMap);
              const isBot = /^\d+$/.test(playerId);
              return (
                <circle
                  key={`dot-${playerId}`}
                  cx={cx} cy={cy}
                  r={isBot ? 3 : 5}
                  fill={isBot ? "#aaaaaa" : getColor(playerId)}
                  stroke="white" strokeWidth="1"
                />
              );
            })}

            {/* EVENTS */}
            {showEvents && events.map((e, i) => {
              const { cx, cy } = worldToCanvas(e.x, e.z, selectedMap);
              const color = EVENT_COLORS[e.event] || "#ffffff";
              return (
                <g key={i}>
                  <circle cx={cx} cy={cy} r="7" fill={color} opacity="0.85" stroke="black" strokeWidth="0.5" />
                  <text x={cx} y={cy + 4} textAnchor="middle" fontSize="7" fill="black" fontWeight="bold">
                    {EVENT_SYMBOLS[e.event] || "?"}
                  </text>
                </g>
              );
            })}
          </svg>

          {loading && (
            <div style={{
              position: "absolute", inset: 0,
              background: "rgba(0,0,0,0.7)",
              display: "flex", alignItems: "center", justifyContent: "center",
              zIndex: 10, color: "white", fontSize: "16px"
            }}>
              Loading match data…
            </div>
          )}
        </div>
      )}

      {/* LEGEND */}
      {selectedMap && (
        <div style={{
          display: "flex", gap: "12px", justifyContent: "center",
          flexWrap: "wrap", marginTop: "12px", fontSize: "12px", color: "#aaa"
        }}>
          {Object.entries(EVENT_COLORS).map(([type, color]) => (
            <span key={type} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: color, display: "inline-block" }} />
              {type}
            </span>
          ))}
          <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <span style={{ width: 16, height: 2, background: "#a78bfa", display: "inline-block" }} />
            Human path
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <span style={{ width: 16, height: 2, background: "#888", display: "inline-block" }} />
            Bot path
          </span>
        </div>
      )}
    </div>
  );
}