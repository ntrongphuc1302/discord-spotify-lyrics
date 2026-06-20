type DebugEnabled = () => boolean;

let _isDebugEnabled: DebugEnabled = () => false;

export function registerDebugModeGetter(getter: DebugEnabled) {
    _isDebugEnabled = getter;
}

export function debugLog(tag: string, message: string, extra?: unknown) {
    if (!_isDebugEnabled()) return;
    const prefix = `[DiscordSpotifyLyrics]`;
    if (extra === undefined) {
        console.info(`${prefix} [${tag}] ${message}`);
    } else {
        console.info(`${prefix} [${tag}] ${message}`, extra);
    }
}
