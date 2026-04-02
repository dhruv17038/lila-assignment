# Insights

---

## Insight 1: AmbroseValley Has a Dominant Central Chokepoint That Funnels Nearly All Engagements

### What I noticed
When viewing kill heatmaps on AmbroseValley across multiple matches, kill and death events cluster overwhelmingly in a central corridor — the river/bridge area near the middle of the map. The outer edges of the map (particularly the northeast and southwest corners) show almost zero combat activity.

### Evidence
Across matches on AmbroseValley, the kill zone heatmap shows a dense red blob concentrated in roughly the central third of the map. Switching to the traffic heatmap confirms players are routing through this area consistently — it's not just where fights happen, it's where players choose to travel. The loot markers (green ◆) also cluster near this zone, suggesting the area is both economically and tactically contested.

### What a level designer should do
The central chokepoint is doing too much work. When one corridor concentrates the majority of engagements, players who control it gain a disproportionate advantage, and players who avoid it have no viable alternate path to loot or engagement. This creates a "play the center or lose" dynamic that reduces strategic diversity.

**Actionable items:**
- Add a secondary loot-rich zone on the eastern or western flank to create an alternate viable route
- Introduce natural cover (terrain, structures) along the perimeter paths to make flanking feel rewarding rather than suicidal
- Track: engagement spread ratio (% of kills outside the top-1 hotspot zone), average match duration, and early-game player distribution across map quadrants

---

## Insight 2: Bot-to-Human Ratio Is Very High — Bots Are Carrying Match Population

### What I noticed
In the player selector dropdown for most matches, there are significantly more bots (numeric IDs like `1382`, `1389`) than human players. Many matches show 10-14 bots alongside 1-3 human players. The best-populated match in the dataset has 16 players total but a large fraction are bots.

### Evidence
The backend debug endpoint reports 339 unique players across 796 matches. Cross-referencing with bot detection (pure numeric user_id), a large share of those 339 are bots. Visually, bot paths (grey) dominate the map canvas in most matches — human paths (colored) are sparse.

### What a level designer should do
This reveals the game is in an early live phase where bot-filling is needed to maintain match viability. For level design, this matters because bots behave differently from humans — they likely follow scripted paths and don't make emergent decisions. This means the kill/traffic heatmaps are partially shaped by bot routing, not purely human behavior.

**Actionable items:**
- Segment all heatmaps and analytics by human-only vs bot-included views (the tool already supports this via the Humans/Bots toggle)
- Be cautious about redesigning areas that appear "underused" — they may simply be areas bots don't route to, not areas humans avoid
- Track: human player count per match over time as a health metric; set a threshold (e.g. 6+ humans per match) before making map changes based on traffic data

---

## Insight 3: KilledByStorm Events Are Rare — The Storm Is Not a Meaningful Threat

### What I noticed
When filtering events to show only `KilledByStorm` (cyan ⚡ markers), they are extremely sparse compared to `Kill`, `Killed`, and `BotKill` events. In most matches, there are zero or one storm death. The storm appears to be present in the game (events exist) but is not driving player deaths or map circulation.

### Evidence
The event distribution visible in the backend logs shows `KilledByStorm` as a valid event type, but visually on the map, cyan markers are nearly absent across the dataset. Kill and BotKill events dominate the event layer. This holds across all three maps and all five days of data.

### What a level designer should do
The storm mechanic is either too slow, too forgiving, or too easy to outrun — it's not creating the intended pressure. In extraction shooters, storm/zone mechanics serve to compress the playable area and force engagements. If players aren't dying to it, they're ignoring it, which means the map's outer zones stay viable indefinitely and players can avoid the central chokepoints entirely.

**Actionable items:**
- Increase storm speed or reduce warning time to force faster map traversal
- Review storm shrink timing relative to average match duration (visible from ts_max in match data)
- Track: KilledByStorm rate per match, average time-of-death for storm kills (early vs late game), and whether matches with more storm deaths have higher human engagement rates
- Consider adding high-value loot in the safe zone center to reward players who rotate quickly