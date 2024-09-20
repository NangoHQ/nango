import type { NangoSync, ProxyConfiguration } from '../../models';
import { getCompany } from '../utils/getCompany.js';

export interface PaginationParams {
    model: string;
    initialPage?: number;
    maxResults?: number;
    additionalFilter?: string;
}

/**
 * Asynchronous generator function for paginating through API results.
 *
 * This function handles pagination by making repeated requests to the specified API endpoint.
 * It yields arrays of results for each page until no more data is available.
 *
 * @param nango The NangoSync instance used for making API calls.
 * @param params Configuration parameters for pagination, including the model, pagination params, and additional filters.
 * @returns An async generator that yields arrays of results from each page.
 */
export async function* paginate<T>(
    nango: NangoSync,
    { model, initialPage = 1, maxResults = 100, additionalFilter = '' }: PaginationParams
): AsyncGenerator<T[], void, undefined> {
    if (!model) {
        throw new Error("'model' parameter is required.");
    }

    let startPosition = initialPage;
    const responseKey = 'QueryResponse'; // Constant across all

    const companyId = await getCompany(nango);

    while (true) {
        const query = buildBaseQuery(model, nango.lastSyncDate, additionalFilter);
        const queryWithPagination = buildQueryWithPagination(query, startPosition, maxResults);

        await nango.log('Syncing records using the following query:', { queryWithPagination });

        const payload: ProxyConfiguration = {
            endpoint: `/v3/company/${companyId}/query`,
            params: { query: queryWithPagination },
            retries: 10
        };

        const response = await nango.get<Record<string, any>>(payload);

        if (!response || !response.data || !response.data[responseKey]) {
            await nango.log('No data found in response, exiting pagination.');
            break;
        }

        let responseData = response.data[responseKey];

        if (model && responseData) {
            responseData = model.split('.').reduce((obj, key) => obj?.[key], responseData);
        }

        const results = (responseData as T[]) || [];

        if (results.length === 0) {
            break;
        }

        yield results;

        startPosition += maxResults;
    }
}

/**
 * Builds the base SQL-like query string.
 *
 * @param model The model to query.
 * @param lastSyncDate The last sync date for incremental sync.
 * @param additionalFilter Additional filter to be applied to the query.
 * @returns The base query string with optional filters.
 */
function buildBaseQuery(model: string, lastSyncDate?: Date, additionalFilter?: string): string {
    let query = `SELECT * FROM ${model}`;

    if (lastSyncDate) {
        query = addIncrementalFilter(query, lastSyncDate);
    }

    if (additionalFilter) {
        query += lastSyncDate ? ` AND ${additionalFilter}` : ` WHERE ${additionalFilter}`;
    }

    return query;
}

/**
 * Creates a query string with pagination parameters.
 *
 * @param query The base SQL-like query string.
 * @param startPosition The position to start fetching results from.
 * @param maxResults The maximum number of results to fetch.
 * @returns The query string with pagination parameters.
 */
function buildQueryWithPagination(query: string, startPosition: number, maxResults: number): string {
    return `${query} STARTPOSITION ${startPosition} MAXRESULTS ${maxResults}`;
}

/**
 * Adds an incremental filter to the SQL-like query based on the last sync date.
 *
 * @param query The base SQL-like query string.
 * @param lastSyncDate The date to filter records based on creation time.
 * @returns The query string with incremental filter.
 */
function addIncrementalFilter(query: string, lastSyncDate: Date): string {
    const formattedDate = lastSyncDate.toISOString();
    return `${query} WHERE Metadata.LastUpdatedTime > '${formattedDate}'`;
}
