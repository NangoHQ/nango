import type { InternalNango as Nango } from '../../credentials-verification-script.js';

export default async function execute(nango: Nango) {
    const { provider_config_key } = nango.getConnection();

    // POST /graphql (NerdGraph) with the read-only `requestContext` query, which returns the user the key belongs to
    // https://docs.newrelic.com/docs/apis/nerdgraph/get-started/introduction-new-relic-nerdgraph/
    // A missing, revoked or deleted key is answered with 401 (proxy throws)
    // https://newrelic.com/info/blog/explainer/nerdgraph-401-unauthorized-the-header-you-re-missing-and-how-to-fix-it
    const response = await nango.proxy({
        method: 'POST',
        endpoint: '/graphql',
        providerConfigKey: provider_config_key,
        data: {
            query: '{ requestContext { userId apiKey } }'
        }
    });

    if (!hasUser(response)) {
        throw new Error('Invalid credentials');
    }
}

function hasUser(response: unknown): boolean {
    if (typeof response !== 'object' || response === null || !('status' in response) || !('data' in response)) {
        return false;
    }

    if (typeof response.status !== 'number' || response.status < 200 || response.status >= 300) {
        return false;
    }

    let body: unknown = response.data;
    // the body may come back as text when the content type is not JSON
    if (typeof body === 'string') {
        try {
            body = JSON.parse(body);
        } catch {
            return false;
        }
    }

    // GraphQL can answer 200 with an `errors` array and no data
    if (typeof body !== 'object' || body === null || !('data' in body)) {
        return false;
    }
    if ('errors' in body && Array.isArray(body.errors) && body.errors.length > 0) {
        return false;
    }

    const data: unknown = body.data;
    if (typeof data !== 'object' || data === null || !('requestContext' in data)) {
        return false;
    }

    const requestContext: unknown = data.requestContext;
    return typeof requestContext === 'object' && requestContext !== null && 'userId' in requestContext && requestContext.userId != null;
}
