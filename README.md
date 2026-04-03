# LILA BLACK — Player Journey Visualizer

A web-based tool for Level Designers to explore player behavior on LILA BLACK maps. Visualizes player paths, combat events, and heatmaps from raw telemetry data.

**Live Tool:** https://lila-assignment.vercel.app  
**Backend API:** https://lila-assignment-5vud.onrender.com

---
## ⚠️ Important Note on Backend Cold Start

The backend is hosted on Render's free tier, which **spins down after inactivity**.

If the map dropdown appears empty when you first open the tool:
1. Wait **30-60 seconds**
2. Refresh the page
3. Maps will load normally

This is a Render free tier limitation. The tool works fully once the backend is awake.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite |
| Visualization | SVG + HTML Canvas |
| Backend | FastAPI (Python) |
| Data | Parquet via PyArrow + Pandas |
| Frontend Hosting | Vercel |
| Backend Hosting | Render |

---

## Features

- Player path visualization on minimap (humans vs bots)
- Event markers: Kill, Killed, BotKill, BotKilled, KilledByStorm, Loot
- Filter by map, date, and match
- Timeline playback to watch matches unfold
- Heatmap overlays: kill zones, death zones, traffic

---

## Local Setup

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

Backend runs at `http://127.0.0.1:8000`

Make sure `player_data/` folder is inside `backend/`:
```
backend/
├── main.py
├── requirements.txt
└── player_data/
    ├── February_11/
    ├── February_12/
    └── ...
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:5173`

---

## Environment Variables

No `.env` file needed. The only config is the backend URL in `frontend/src/App.jsx`:

```javascript
const BASE_URL = "https://lila-assignment-5vud.onrender.com"; // production
// const BASE_URL = "http://127.0.0.1:8000"; // local dev
```

Switch to the local URL when running locally.

---

## Project Structure

```
lila-assignment/
├── frontend/          # React + Vite app
│   ├── src/
│   │   └── App.jsx    # Main component
│   └── public/
│       └── minimaps/  # Map images (AmbroseValley, GrandRift, Lockdown)
├── backend/
│   ├── main.py        # FastAPI app
│   ├── requirements.txt
│   └── player_data/   # Parquet telemetry files
├── ARCHITECTURE.md
├── INSIGHTS.md
└── README.md
```

---

## API Endpoints

| Endpoint | Description |
|---|---|
| `GET /maps` | List all map IDs |
| `GET /dates` | List all available dates |
| `GET /matches?map_id=X&date=Y` | List matches for a map/date |
| `GET /match_data?match_id=X` | Full telemetry for a match |
| `GET /debug` | Dataset summary stats |