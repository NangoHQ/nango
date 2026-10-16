/** Driver messages and unknown codes may contain query values. Never log them here. */
export function conversionErrorCode(err: unknown): string {
    const code = err instanceof Error && 'code' in err ? err.code : undefined;
    return typeof code === 'string' && ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', '57014', '40P01', '40001'].includes(code) ? code : 'unknown';
}
