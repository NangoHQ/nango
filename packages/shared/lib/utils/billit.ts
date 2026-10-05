/** Keep Billit OAuth credentials on the two supported environments, even when Connect UI is bypassed. */
export function validateBillitOAuthConnectionConfig(providerName: string, connectionConfig: Record<string, unknown>): void {
    if (providerName !== 'billit-oauth') {
        return;
    }

    const domain = connectionConfig['domain'];
    if (domain !== 'billit.be' && domain !== 'sandbox.billit.be') {
        throw new Error('Billit OAuth domain must be billit.be or sandbox.billit.be');
    }
}
