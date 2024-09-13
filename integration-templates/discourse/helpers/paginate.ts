import type { NangoSync, ProxyConfiguration } from '../../models';

export interface PaginationParams {
    endpoint: string;
    initialPage?: number;
    params?: Record<string, any>;
}

/**
 * Asynchronous generator function for paginating through API results.
 *
 * This function handles pagination by making repeated requests to the specified API endpoint.
 * It yields arrays of results for each page until no more data is available.
 *
 * @param nango The NangoSync instance used for making API calls.
 * @param params Configuration parameters for pagination, including the endpoint, initial page, and additional params.
 * @returns An async generator that yields arrays of results from each page.
 */
async function* paginate<T>(nango: NangoSync, { endpoint, initialPage = 1, params }: PaginationParams): AsyncGenerator<T[], void, undefined> {
    let currentPage = initialPage;

    while (true) {
        const payload: ProxyConfiguration = {
            endpoint,
            params: {
                page: currentPage,
                ...params
            }
        };

        const response = await nango.get<T[]>(payload);
        const responseData = response.data;

        if (!responseData || responseData.length === 0) {
            break;
        }

        yield responseData;

        currentPage++;
    }
}

export default paginate;
