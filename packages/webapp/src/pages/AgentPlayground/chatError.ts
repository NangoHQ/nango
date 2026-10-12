export interface ChatErrorDisplay {
    title: string;
    detail?: string;
    action: 'retry' | 'new-chat' | 'none';
}

// A failed request carries the response body as its message, so the API's error code is inside it.
export function describeChatError(error: Error): ChatErrorDisplay {
    let code: string | undefined;
    let detail = error.message;
    try {
        const body = JSON.parse(error.message) as { error?: { code?: unknown; message?: unknown } };
        code = typeof body.error?.code === 'string' ? body.error.code : undefined;
        detail = typeof body.error?.message === 'string' ? body.error.message : code ? '' : detail;
    } catch {
        // Not JSON: an error sent mid-reply, as plain text.
    }

    switch (code) {
        case 'feature_disabled':
            return { title: 'The Agent Playground is not enabled for this account.', action: 'none' };
        case 'session_creation_failed':
            return { title: "Couldn't start the agent.", ...(detail ? { detail } : {}), action: 'retry' };
        case 'invalid_body':
            return { title: "This chat can't continue.", ...(detail ? { detail } : {}), action: 'new-chat' };
        default:
            return { title: 'The agent ran into a problem.', ...(detail ? { detail } : {}), action: 'retry' };
    }
}
