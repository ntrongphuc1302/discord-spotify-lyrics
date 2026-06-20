# Discord Spotify Lyrics

> Vencord userplugin — displays synced Spotify lyrics as your Discord custom status in real time.

```
Now Playing → Discord status shows synchronized lyrics
```

---

## Installation

### Requirements

- Discord desktop (Stable / PTB / Canary)
- [Vencord](https://github.com/Vendicated/Vencord) installed
- Spotify account linked to Discord
- Node.js 18+, pnpm

### Steps

**1. Install Vencord**

```bash
# Use the official installer: https://github.com/Vendicated/Vencord
```

**2. Add the plugin**

```bash
# Copy the plugin folder into your Vencord source
cp -r discord-spotify-lyrics /path/to/Vencord/src/userplugins/
```

**3. Build & Inject**

```bash
cd /path/to/Vencord
pnpm build
pnpm inject
```

**4. Enable**

Open Discord → Settings → Vencord → Plugins → toggle **DiscordSpotifyLyrics** on

---

## Settings

| Option | Description |
|---|---|
| `clearOnStop` | Clear status when playback stops/pauses |
| `fallbackTrackText` | Show track name when lyrics are unavailable |
| `customEmoji` | Emoji shown in custom status (empty = musical note default) |
| `trackSwitchBoost` | Faster polling shortly after a track change |
| `forceRefreshOnTrackSwitch` | Fetch lyrics immediately when switching tracks |
| `debugMode` | Enable verbose debug logs |

> Manual refresh: `globalThis.discordSpotifyLyricsForceRefresh()`

---

## Privacy

- No password required
- No API key needed
- Only requests data from `lrclib.net`
- CSP permission for `lrclib.net` may be prompted on first setup

---

## Troubleshooting

| Issue | Fix |
|---|---|
| No lyrics shown | Confirm Spotify is linked to Discord; enable `fallbackTrackText` |
| CSP blocked | Grant the permission prompt, then fully restart Discord |
| Delay on track switch | Enable `trackSwitchBoost` + `forceRefreshOnTrackSwitch` |

---

## Project Structure

```
discord-spotify-lyrics/
├── index.ts      # Plugin entry point
├── spotify.ts    # Read track from Discord activity
├── lyrics.ts     # Fetch lyrics from LRCLIB
├── status.ts     # Update Discord custom status
├── scheduler.ts  # Queue & retry logic
├── types.ts      # Type definitions
└── native.ts
```

---

## Issues & Support

→ [GitHub Issues](https://github.com/ntrongphuc1302/discord-spotify-lyrics/issues)

---

> **Disclaimer** — Community plugin, not affiliated with or endorsed by the Vencord team.
