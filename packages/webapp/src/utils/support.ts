/**
 * Plain loads from a script that needs `PLAIN_APP_ID`, so the chat is absent wherever that isn't
 * configured — local dev included. The community Slack is the fallback rather than a dead button.
 */
export function openSupportChat() {
    if (window.Plain) {
        window.Plain.open();
        return;
    }
    window.open('https://nango.dev/slack', '_blank', 'noopener,noreferrer');
}
