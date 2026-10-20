const OPEN_LINK_TEXT = /^\[([^\]\n]*)\]?$/;
const OPEN_LINK_URL = /^\[([^\]\n]*)\]\(([^)\s]*)$/;

// Only for text that is still streaming: on finished text it would strip a literal trailing "[".
export function hideTrailingLink(text: string): string {
    const start = text.lastIndexOf('[');
    if (start === -1) {
        return text;
    }

    const tail = text.slice(start);
    const open = OPEN_LINK_URL.exec(tail) ?? OPEN_LINK_TEXT.exec(tail);
    return open ? `${text.slice(0, start)}${open[1]}` : text;
}
