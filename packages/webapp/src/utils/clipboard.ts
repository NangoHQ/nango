/**
 * `navigator.clipboard` only exists on secure origins, so a self-hosted dashboard served over plain HTTP
 * falls back to the legacy copy command.
 */
export async function copyText(text: string): Promise<void> {
    if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        return;
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
