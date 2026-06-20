import { Logger } from "@utils/Logger";
import { RestAPI } from "@webpack/common";

const logger = new Logger("DiscordSpotifyLyrics");
const TAG = "status";

type QueueEntry = {
    body: unknown;
    label: string;
    fallbackBody?: unknown;
};

const queue: QueueEntry[] = [];
let processing = false;
let lastText: string | null = null;
let _setDebugMode: ((enabled: boolean) => void) | null = null;

export function setStatusDebugMode(enabled: boolean) {
    if (_setDebugMode) _setDebugMode(enabled);
}

function debugLog(message: string, extra?: unknown) {
    if (!_setDebugMode) return;
    const prefix = `[DiscordSpotifyLyrics]`;
    if (extra === undefined) {
        console.info(`${prefix} [${TAG}] ${message}`);
    } else {
        console.info(`${prefix} [${TAG}] ${message}`, extra);
    }
}

async function processQueue() {
    if (processing) return;
    processing = true;

    while (queue.length > 0) {
        const entry = queue[0];

        try {
            await RestAPI.patch({ url: "/users/@me/settings", body: entry.body });
            logger.info(`Status updated: ${entry.label}`);
            queue.shift();
        } catch (error: unknown) {
            const err = error as { body?: { retry_after?: number }; status?: number } | undefined;
            const retryAfterMs = Math.ceil((err?.body?.retry_after ?? 1) * 1_000);

            if (err?.status === 429) {
                if (queue.length > 1) {
                    debugLog(`Rate limit — dropped stale entry: ${entry.label}`);
                    queue.shift();
                    continue;
                }
                logger.warn(`Rate limited, retrying in ${retryAfterMs}ms`);
                await new Promise(resolve => setTimeout(resolve, retryAfterMs));
                continue;
            }

            if (entry.fallbackBody) {
                logger.warn("Primary payload rejected, retrying with fallback format");
                queue[0] = { body: entry.fallbackBody, label: entry.label };
                continue;
            }

            logger.error("Failed to update custom status", error);
            queue.shift();
        }
    }

    processing = false;
}

export function setCustomStatus(text: string, emojiName = "musical_note") {
    if (text === lastText) return;
    lastText = text;

    enqueue({
        body: {
            custom_status: {
                text: text.slice(0, 128),
                emoji_name: emojiName,
                expires_at: null,
            },
        },
        fallbackBody: {
            customStatus: {
                text: text.slice(0, 128),
                emojiName,
                expiresAt: null,
            },
        },
        label: text,
    });

    void processQueue();
}

export function clearCustomStatus() {
    if (lastText === null) return;
    lastText = null;

    enqueue({
        body: { custom_status: null },
        fallbackBody: { customStatus: null },
        label: "(clear)",
    });

    void processQueue();
}

export function resetStatusCache() {
    lastText = null;
}

function enqueue(entry: QueueEntry) {
    if (!processing) {
        queue.length = 0;
        queue.push(entry);
        return;
    }
    queue.length = queue.length > 0 ? 1 : 0;
    queue.push(entry);
}
