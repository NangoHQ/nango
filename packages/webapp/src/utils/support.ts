/** Plain needs `PLAIN_APP_ID`, so where that is unset the community Slack stands in for a dead button. */
export function openSupportChat() {
    if (window.Plain) {
        window.Plain.open();
        return;
    }
    window.open('https://nango.dev/slack', '_blank', 'noopener,noreferrer');
}
