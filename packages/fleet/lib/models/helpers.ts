import crypto from 'crypto';

export function generateImage(): string {
    const charset = '0123456789abcdef';
    const length = 40;
    const randomBytes = new Uint8Array(length);
    crypto.getRandomValues(randomBytes);

    const commitHash = Array.from(randomBytes)
        .map((byte) => charset[byte % charset.length])
        .join('');
    return `generated/image:${commitHash}`;
}
