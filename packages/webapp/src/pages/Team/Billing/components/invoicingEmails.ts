import { z } from 'zod';

const emailSchema = z.string().email();

/** Commas and whitespace both separate addresses, so a pasted list splits the same way a typed one does. */
export function parseEmailTokens(text: string): string[] {
    return text
        .split(/[,\s]+/)
        .map((token) => token.trim())
        .filter(Boolean);
}

export function isCompleteEmail(value: string): boolean {
    return emailSchema.safeParse(value).success;
}

/** True when every token is a complete address, i.e. the text is safe to turn into chips. */
export function isFullyTokenizable(text: string): boolean {
    const tokens = parseEmailTokens(text);
    return tokens.length > 0 && tokens.every(isCompleteEmail);
}
