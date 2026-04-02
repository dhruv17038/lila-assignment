from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import pyarrow.parquet as pq
import os

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_PATH = "../player_data"


def load_all_data():
    frames = []

    for day in sorted(os.listdir(BASE_PATH)):
        day_path = os.path.join(BASE_PATH, day)
        if not os.path.isdir(day_path) or day.startswith("."):
            continue

        for file in os.listdir(day_path):
            if file.startswith("."):
                continue

            path = os.path.join(day_path, file)
            if not os.path.isfile(path):
                continue

            try:
                table = pq.read_table(path)
                temp_df = table.to_pandas()

                # Parse user_id from filename
                filename = file
                if ".nakama" in filename:
                    filename = filename[:filename.index(".nakama")]
                first_underscore = filename.index("_")
                file_user_id = filename[:first_underscore]

                # Use user_id from filename
                temp_df["user_id"] = file_user_id

                # KEEP match_id from parquet column (includes .nakama-0 suffix)
                # This is how all players in same match share the same match_id
                temp_df["day"] = day
                frames.append(temp_df)

            except Exception as e:
                print(f"Skipping {path}: {e}")
                continue

    if not frames:
        print("No data loaded")
        return pd.DataFrame()

    df = pd.concat(frames, ignore_index=True)
    print(f"Total rows loaded: {len(df)}")

    # Decode event bytes
    df["event"] = df["event"].apply(
        lambda x: x.decode("utf-8") if isinstance(x, bytes) else str(x)
    )

    df["user_id"] = df["user_id"].astype(str).str.strip()
    df["match_id"] = df["match_id"].astype(str).str.strip()
    df["is_bot"] = df["user_id"].str.match(r"^\d+$")

    for col in ["x", "y", "z"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    # TS FIX
    # datetime64[ms].astype(int64) gives milliseconds since epoch directly
    # e.g. 1770754537 ms. Normalize per match → elapsed seconds from match start
    df["ts_ms"] = df["ts"].values.astype("int64")
    raw_spread = df["ts_ms"].max() - df["ts_ms"].min()
    print(f"Raw ts_ms spread across all data: {raw_spread}ms = {raw_spread/1000:.1f}s")

    df["ts"] = df.groupby("match_id")["ts_ms"].transform(
        lambda x: (x - x.min()) / 1000.0
    )
    df["ts"] = df["ts"].round(3)
    df.drop(columns=["ts_ms"], inplace=True)

    print(f"TS range after fix: {df['ts'].min():.1f}s to {df['ts'].max():.1f}s")

    print(f"Maps: {df['map_id'].unique().tolist() if 'map_id' in df.columns else 'N/A'}")
    print(f"Unique matches: {df['match_id'].nunique()}")
    print(f"Unique players: {df['user_id'].nunique()}")
    print(f"Events: {df['event'].unique().tolist()}")

    if "match_id" in df.columns:
        match_counts = df.groupby("match_id")["user_id"].nunique()
        best = match_counts.idxmax()
        print(f"Best match: {best} has {match_counts[best]} players")

    return df


df = load_all_data()


@app.get("/")
def home():
    return {"status": "running", "rows": len(df)}


@app.get("/maps")
def get_maps():
    if df.empty or "map_id" not in df.columns:
        return []
    return df["map_id"].dropna().unique().tolist()


@app.get("/dates")
def get_dates():
    if df.empty or "day" not in df.columns:
        return []
    return sorted(df["day"].dropna().unique().tolist())


@app.get("/matches")
def get_matches(map_id: str, date: str = None):
    if df.empty:
        return []
    filtered = df[df["map_id"] == map_id]
    if date and "day" in df.columns:
        filtered = filtered[filtered["day"] == date]
    result = sorted(filtered["match_id"].dropna().unique().tolist())
    print(f"Matches for {map_id} / {date}: {len(result)}")
    return result


@app.get("/match_data")
def get_match_data(match_id: str):
    if df.empty:
        return []

    match_df = df[df["match_id"] == match_id].copy()

    print(f"match_id: {match_id} | rows: {len(match_df)} | players: {match_df['user_id'].nunique() if not match_df.empty else 0}")

    if match_df.empty:
        return []

    match_df = match_df.sort_values("ts").reset_index(drop=True)
    match_df = match_df.dropna(subset=["x", "z"])

    cols = ["user_id", "match_id", "map_id", "x", "y", "z", "ts", "event", "is_bot"]
    available = [c for c in cols if c in match_df.columns]

    result = match_df[available].to_dict(orient="records")
    print(f"Returning {len(result)} rows, ts range: {match_df['ts'].min():.1f}s to {match_df['ts'].max():.1f}s")
    return result


@app.get("/debug")
def debug():
    if df.empty:
        return {"error": "no data"}
    sample = df.head(3)[["user_id", "match_id", "map_id", "x", "y", "z", "ts", "event", "is_bot"]].to_dict(orient="records")
    match_counts = df.groupby("match_id")["user_id"].nunique()
    return {
        "total_rows": len(df),
        "unique_matches": int(df["match_id"].nunique()),
        "unique_players": int(df["user_id"].nunique()),
        "maps": df["map_id"].unique().tolist() if "map_id" in df.columns else [],
        "days": sorted(df["day"].unique().tolist()) if "day" in df.columns else [],
        "x_range": [float(df["x"].min()), float(df["x"].max())],
        "z_range": [float(df["z"].min()), float(df["z"].max())],
        "ts_range": [float(df["ts"].min()), float(df["ts"].max())],
        "events": df["event"].unique().tolist(),
        "max_players_in_match": int(match_counts.max()),
        "avg_players_per_match": round(float(match_counts.mean()), 2),
        "sample": sample,
    }


@app.get("/match_debug")
def match_debug(match_id: str):
    match_df = df[df["match_id"] == match_id].copy()
    if match_df.empty:
        return {"error": "not found"}
    spread = match_df["ts"].max() - match_df["ts"].min()
    return {
        "rows": len(match_df),
        "players": match_df["user_id"].nunique(),
        "ts_min": float(match_df["ts"].min()),
        "ts_max": float(match_df["ts"].max()),
        "ts_spread_seconds": float(spread),
        "events": match_df["event"].value_counts().to_dict(),
        "sample_ts": match_df["ts"].head(10).tolist(),
        "human_players": match_df[~match_df["is_bot"]]["user_id"].unique().tolist(),
        "bot_count": int(match_df[match_df["is_bot"]]["user_id"].nunique()),
    }


@app.get("/raw_file_check")
def raw_file_check():
    results = []
    for day in sorted(os.listdir(BASE_PATH)):
        day_path = os.path.join(BASE_PATH, day)
        if not os.path.isdir(day_path) or day.startswith("."):
            continue
        files = [f for f in os.listdir(day_path)
                 if not f.startswith(".") and os.path.isfile(os.path.join(day_path, f))][:3]
        for file in files:
            path = os.path.join(day_path, file)
            try:
                t = pq.read_table(path).to_pandas()
                raw_ts = t["ts"].iloc[0] if "ts" in t.columns else None
                results.append({
                    "filename": file,
                    "parquet_match_id": str(t["match_id"].iloc[0]) if "match_id" in t.columns else "MISSING",
                    "parquet_user_id": str(t["user_id"].iloc[0]) if "user_id" in t.columns else "MISSING",
                    "raw_ts_sample": str(raw_ts),
                    "rows": len(t),
                })
            except Exception as e:
                results.append({"filename": file, "error": str(e)})
        break
    return results