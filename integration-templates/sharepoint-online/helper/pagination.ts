import type { NangoSync } from '../../models';
import { URL } from 'url';

export interface PaginationParams {
    endpoint: string;
    data?: Record<string, any>;
    deltaToken?: string;
    $top?: number;
}

export interface PaginationResponse<T> {
    value: T[];
    deltaToken?: string | undefined;
}

interface Payload {
    endpoint: string;
    params: Record<string, any>;
    retries: number;
}

/**
 * Extracts the token from the provided URL.
 * @param urlString The URL string to extract the token from.
 * @param tokenName The name of the token to extract.
 * @returns The token value or undefined if not found.
 */
function extractToken(urlString: string, tokenName: string): string | undefined {
    const urlObj = new URL(urlString);
    const token = urlObj.searchParams.get(tokenName);
    return token ?? undefined;
}

/**
 * Paginates through data from a specified endpoint using a given synchronization token.
 *
 * This function handles pagination and synchronization using the nextLink and deltaLink approaches from Microsoft Graph API.
 * It uses @odata.nextLink for subsequent requests to fetch additional data and @odata.deltaLink for incremental syncing.
 *
 * @param nango The NangoSync instance used for making API calls.
 * @param params The PaginationParams object containing endpoint, deltaToken, and optional $top.
 * @returns An async generator that yields batches of results and the delta token for incremental sync.
 */
async function* paginate<T>(nango: NangoSync, { endpoint, deltaToken, $top }: PaginationParams): AsyncGenerator<PaginationResponse<T>, void, undefined> {
    let continuePagination = true;
    let nextLink: string | null = null;

    while (continuePagination) {
        const requestParams = {
            ...(deltaToken ? { token: deltaToken } : {}),
            ...(nextLink ? { token: nextLink } : {}),
            ...($top ? { $top } : {})
        };

        const payload: Payload = {
            endpoint,
            params: requestParams,
            retries: 10
        };

        const response = await nango.get<{
            value?: T[];
            '@odata.nextLink'?: string;
            '@odata.deltaLink'?: string;
        }>(payload);

        const { data: responseData } = response;

        const results = responseData.value || [];
        const nextLinkFromResponse = responseData['@odata.nextLink'];
        const deltaLinkFromResponse = responseData['@odata.deltaLink'];

        const extractedDeltaToken = deltaLinkFromResponse ? extractToken(deltaLinkFromResponse, 'token') : undefined;

        if (nextLinkFromResponse !== undefined) {
            nextLink = extractToken(nextLinkFromResponse, 'token') || null;
        } else {
            continuePagination = false;
        }

        yield { value: results, deltaToken: extractedDeltaToken };
    }
}

export default paginate;
