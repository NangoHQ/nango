/** secretKey wins while jobs still sends both. taskAuthToken is the credential once secretKey is omitted. */
export function runnerBearer(credentials: { secretKey?: string | undefined; taskAuthToken?: string | undefined }): string {
    const bearer = credentials.secretKey ?? credentials.taskAuthToken;
    if (!bearer) {
        throw new Error('Parameter taskAuthToken or secretKey is required');
    }
    return bearer;
}
