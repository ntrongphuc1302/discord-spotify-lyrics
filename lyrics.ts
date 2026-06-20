import type { LyricLine } from "./types";
import { debugLog } from "./debug";

const BASE_URL = "https://lrclib.net/api";
const cache = new Map<string, LyricLine[] | null>();

type NetworkAccessState = "unknown" | "allowed" | "blocked";
let networkAccess: NetworkAccessState = "unknown";
let permissionRequested = false;
let blockedWarned = false;

let _setDebugMode: ((enabled: boolean) => void) | null = null;

export function setLyricsDebugMode(enabled: boolean) {
    if (_setDebugMode) _setDebugMode(enabled);
}

export function clearLyricsCache(trackId?: string) {
    if (trackId) {
        cache.delete(trackId);
        debugLog("lyrics", `Cache cleared for ${trackId}`);
    } else {
        cache.clear();
        debugLog("lyrics", "Full cache cleared");
    }
}

export async function initLyricsNetworkAccess() {
    if (networkAccess !== "unknown") return;

    const url = "https://lrclib.net";
    const directives = ["connect-src"];

    const allowed = await VencordNative.csp.isDomainAllowed(url, directives).catch(() => false);
    if (allowed) {
        networkAccess = "allowed";
        return;
    }

    if (!permissionRequested) {
        permissionRequested = true;
        const result = await VencordNative.csp.requestAddOverride(url, directives, "DiscordSpotifyLyrics").catch(() => "cancelled");
        if (result === "ok") {
            console.info("[DiscordSpotifyLyrics] CSP permission granted for lrclib.net. Fully restart Discord to apply.");
        }
    }

    networkAccess = "blocked";
}

function parseLrc(lrc: string): LyricLine[] {
    const lines: LyricLine[] = [];
    const regex = /^\[(\d{2}):(\d{2})\.(\d{2,3})\]\s*(.*)$/;

    for (const rawLine of lrc.split("\n")) {
        const match = rawLine.trim().match(regex);
        if (!match) continue;

        const [, mm, ss, cs, text] = match;
        const ms =
            parseInt(mm, 10) * 60_000 +
            parseInt(ss, 10) * 1_000 +
            (cs.length === 3 ? parseInt(cs, 10) : parseInt(cs, 10) * 10);

        lines.push({ timeMs: ms, text: text.trim() });
    }

    return lines.sort((a, b) => a.timeMs - b.timeMs);
}

export async function getLyrics(
    trackId: string,
    trackName: string,
    artistName: string,
    albumName = "",
    durationMs = 0,
    forceRefresh = false,
): Promise<LyricLine[] | null> {
    if (forceRefresh) {
        cache.delete(trackId);
        debugLog("lyrics", `Force refresh: ${trackName} - ${artistName}`);
    }

    if (cache.has(trackId)) return cache.get(trackId) ?? null;

    if (networkAccess === "unknown") await initLyricsNetworkAccess();

    if (networkAccess !== "allowed") {
        if (!blockedWarned) {
            blockedWarned = true;
            console.warn("[DiscordSpotifyLyrics] LRCLIB blocked by CSP. Grant permission and fully restart Discord.");
        }
        debugLog("lyrics", `CSP blocked: ${trackId}`);
        cache.set(trackId, null);
        return null;
    }

    try {
        const params = new URLSearchParams({ track_name: trackName, artist_name: artistName });
        if (albumName) params.set("album_name", albumName);
        if (durationMs > 0) params.set("duration", String(Math.round(durationMs / 1_000)));

        const res = await fetch(`${BASE_URL}/get?${params}`);

        if (res.status === 404) {
            cache.set(trackId, null);
            debugLog("lyrics", `Not found (404): ${trackName} - ${artistName}`);
            return null;
        }

        if (!res.ok) throw new Error(`LRCLIB HTTP ${res.status}`);

        const data = await res.json();
        if (!data?.syncedLyrics) {
            cache.set(trackId, null);
            debugLog("lyrics", `No syncedLyrics in response: ${trackId}`);
            return null;
        }

        const lines = parseLrc(data.syncedLyrics);
        cache.set(trackId, lines);
        debugLog("lyrics", `Loaded ${lines.length} lines for ${trackId}`);
        return lines;
    } catch {
        cache.set(trackId, null);
        debugLog("lyrics", `Request failed: ${trackName} - ${artistName}`);
        return null;
    }
}
