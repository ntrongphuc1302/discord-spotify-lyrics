/*
 * DiscordSpotifyLyrics — Vencord userplugin
 * Author: ntrongphuc1302
 * Unofficial community plugin — not affiliated with Vencord.
 */

import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";

import { clearLyricsCache, getLyrics, initLyricsNetworkAccess } from "./lyrics";
import { LyricScheduler } from "./scheduler";
import { getCurrentTrack } from "./spotify";
import { clearCustomStatus, resetStatusCache, setCustomStatus } from "./status";
import { registerDebugModeGetter } from "./debug";
import type { LyricLine, SpotifyTrackState } from "./types";

const POLL_INTERVAL_MS = 500;
const BOOST_POLL_INTERVAL_MS = 180;
const TRACK_SWITCH_BOOST_WINDOW_MS = 3_000;
const SEEK_THRESHOLD_MS = 2_000;
const MIN_LYRIC_LINE_LENGTH = 2;
const LYRIC_PADDING_CHAR = "♪";

const settings = definePluginSettings({
    clearOnStop: {
        type: OptionType.BOOLEAN,
        description: "Clear custom status when playback stops or is paused",
        default: true,
    },
    fallbackTrackText: {
        type: OptionType.BOOLEAN,
        description: "Show track name when synced lyrics are unavailable",
        default: true,
    },
    customEmoji: {
        type: OptionType.STRING,
        description: "Emoji shown in the custom status (defaults to musical note)",
        default: "",
    },
    trackSwitchBoost: {
        type: OptionType.BOOLEAN,
        description: "Poll faster for 3s after a track switch",
        default: true,
    },
    forceRefreshOnTrackSwitch: {
        type: OptionType.BOOLEAN,
        description: "Bypass lyrics cache when switching tracks",
        default: true,
    },
    debugMode: {
        type: OptionType.BOOLEAN,
        description: "Enable verbose debug logs in console",
        default: false,
    },
});

let currentTrackId: string | null = null;
let scheduler: LyricScheduler | null = null;
let lastProgressMs = 0;
let lastPollTime = 0;
let pollTimer: number | null = null;
let pollingActive = false;
let trackLoadToken = 0;
let boostUntilMs = 0;

let isDebugEnabled = false;

registerDebugModeGetter(() => isDebugEnabled);

function debugLog(message: string, extra?: unknown) {
    if (!isDebugEnabled) return;
    if (extra === undefined) {
        console.info(`[DiscordSpotifyLyrics] ${message}`);
    } else {
        console.info(`[DiscordSpotifyLyrics] ${message}`, extra);
    }
}

function getNextPollDelayMs() {
    if (!settings.store.trackSwitchBoost) return POLL_INTERVAL_MS;
    return Date.now() < boostUntilMs ? BOOST_POLL_INTERVAL_MS : POLL_INTERVAL_MS;
}

function normalizeLyricLine(line: LyricLine) {
    const raw = line.text?.trim() || "";
    if (raw.length >= MIN_LYRIC_LINE_LENGTH) return raw;
    return (raw + ` ${LYRIC_PADDING_CHAR}`).trim().padEnd(MIN_LYRIC_LINE_LENGTH, LYRIC_PADDING_CHAR);
}

function stopScheduler() {
    scheduler?.stop();
    scheduler = null;
}

function onLineChange(line: LyricLine) {
    setCustomStatus(normalizeLyricLine(line), settings.store.customEmoji);
}

function resetRuntimeState() {
    currentTrackId = null;
    lastProgressMs = 0;
    lastPollTime = 0;
    trackLoadToken = 0;
    boostUntilMs = 0;
}

function applyDebugMode() {
    isDebugEnabled = settings.store.debugMode;
}

function setFallbackTrackStatus(track: SpotifyTrackState) {
    if (!settings.store.fallbackTrackText) {
        clearCustomStatus();
        return;
    }
    setCustomStatus(`♪ ${track.trackName} - ${track.artistName}`, settings.store.customEmoji);
}

function shouldIgnoreLyricResult(loadToken: number, trackId: string) {
    return loadToken !== trackLoadToken || currentTrackId !== trackId;
}

async function handleTrackChange(track: SpotifyTrackState, now: number) {
    debugLog("Track changed", { from: currentTrackId, to: track.trackId, trackName: track.trackName, artistName: track.artistName });

    currentTrackId = track.trackId;
    const loadToken = ++trackLoadToken;
    const requestStartedAt = now;

    if (settings.store.trackSwitchBoost) {
        boostUntilMs = now + TRACK_SWITCH_BOOST_WINDOW_MS;
    }

    stopScheduler();
    setFallbackTrackStatus(track);

    const lyrics = await getLyrics(
        track.trackId,
        track.trackName,
        track.artistName,
        track.albumName,
        track.durationMs,
        settings.store.forceRefreshOnTrackSwitch,
    );

    const liveTrack = getCurrentTrack();
    if (!liveTrack?.isPlaying || liveTrack.trackId !== track.trackId) {
        debugLog("Dropping lyrics response — active track changed during fetch", { requested: track.trackId, active: liveTrack?.trackId ?? null });
        return;
    }

    if (shouldIgnoreLyricResult(loadToken, track.trackId)) {
        debugLog("Ignoring stale lyric response", { trackId: track.trackId });
        return;
    }

    if (!lyrics?.length) {
        debugLog("No lyrics found, fallback active if enabled", { trackId: track.trackId });
        return;
    }

    const freshProgressMs = liveTrack.progressMs || (track.progressMs + (Date.now() - requestStartedAt));

    scheduler = new LyricScheduler(lyrics, onLineChange);
    scheduler.start(freshProgressMs);
    debugLog("Scheduler started", { trackId: track.trackId, lines: lyrics.length, progressMs: freshProgressMs });
}

function syncSchedulerDrift(track: SpotifyTrackState, now: number) {
    if (!scheduler || lastPollTime <= 0) return;

    const elapsed = now - lastPollTime;
    const expected = lastProgressMs + elapsed;
    const drift = Math.abs(track.progressMs - expected);

    if (drift <= SEEK_THRESHOLD_MS) return;

    debugLog("Drift detected, restarting scheduler", { trackId: track.trackId, drift, progressMs: track.progressMs });
    scheduler.restart(track.progressMs);
}

async function poll() {
    const track = getCurrentTrack();
    const now = Date.now();

    if (!track || !track.isPlaying) {
        if (currentTrackId !== null) {
            debugLog("Playback stopped/paused", { previousTrackId: currentTrackId });
            stopScheduler();
            currentTrackId = null;
            if (settings.store.clearOnStop) clearCustomStatus();
        }
        lastPollTime = now;
        return;
    }

    if (track.trackId !== currentTrackId) {
        await handleTrackChange(track, now);
    } else {
        syncSchedulerDrift(track, now);
    }

    lastProgressMs = track.progressMs;
    lastPollTime = now;
}

function startPolling() {
    stopPolling();
    resetRuntimeState();
    stopScheduler();
    resetStatusCache();
    applyDebugMode();
    pollingActive = true;

    const pollLoop = async () => {
        if (!pollingActive) return;
        await poll();
        if (!pollingActive) return;
        pollTimer = window.setTimeout(() => void pollLoop(), getNextPollDelayMs());
    };

    void pollLoop();
}

function stopPolling() {
    pollingActive = false;
    if (pollTimer !== null) {
        window.clearTimeout(pollTimer);
        pollTimer = null;
    }
}

function forceRefreshCurrentTrackLyrics(albumName?: string) {
    if (!currentTrackId) return;
    clearLyricsCache(currentTrackId, albumName);
    trackLoadToken++;
    debugLog("Manual force refresh", { trackId: currentTrackId });
    currentTrackId = null;
    void poll();
}

export default definePlugin({
    name: "DiscordSpotifyLyrics",
    description: "Show synced Spotify lyrics in your Discord custom status",
    tags: ["Activity", "Media", "Utility"],
    authors: [{ name: "ntrongphuc1302", id: 0n }],
    settings,
    requiresRestart: false,

    start() {
        void initLyricsNetworkAccess();
        (globalThis as unknown as Record<string, unknown>).discordSpotifyLyricsForceRefresh = forceRefreshCurrentTrackLyrics;
        startPolling();
    },

    stop() {
        stopPolling();
        stopScheduler();
        currentTrackId = null;
        trackLoadToken++;
        delete (globalThis as unknown as Record<string, unknown>).discordSpotifyLyricsForceRefresh;
        if (settings.store.clearOnStop) clearCustomStatus();
    },
});
