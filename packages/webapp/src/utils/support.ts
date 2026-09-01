/** Plain needs `PLAIN_APP_ID`, so where that is unset the community Slack stands in for a dead button. */
export function openSupportChat() {
    // The script assigns `window.Plain` before `init` runs, so its presence alone doesn't mean it opens.
    if (window.Plain?.isInitialized()) {
        window.Plain.open();
        return;
    }
    window.open('https://nango.dev/slack', '_blank', 'noopener,noreferrer');
}
