/** taskAuthToken wins when both are present, so the token path is used before secretKey is omitted. */
export function runnerBearer(credentials: { secretKey?: string | undefined; taskAuthToken?: string | undefined }): string {
    const bearer = credentials.taskAuthToken ?? credentials.secretKey;
    if (!bearer) {
        throw new Error('Parameter taskAuthToken or secretKey is required');
    }
    return bearer;
}
