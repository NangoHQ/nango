/**
 * `navigator.clipboard` only exists on secure origins, so a self-hosted dashboard served over plain HTTP
 * falls back to the legacy copy command, as does a rejected clipboard write.
 */
export async function copyText(text: string): Promise<void> {
    if (navigator.clipboard) {
        try {
            await navigator.clipboard.writeText(text);
            return;
        } catch {
            // Denied permission or an unfocused document; the copy command can still work.
        }
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
        if (!document.execCommand('copy')) {
            throw new Error('copy_command_failed');
        }
    } finally {
        textarea.remove();
    }
}
