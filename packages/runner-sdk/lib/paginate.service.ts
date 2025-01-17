import type { AxiosResponse } from 'axios';
import parseLinksHeader from 'parse-link-header';
import get from 'lodash-es/get.js';
import type { CursorPagination, LinkPagination, OffsetCalculationMethod, OffsetPagination, Pagination, UserProvidedProxyConfiguration } from '@nangohq/types';

function isValidURL(str: string): boolean {
    try {
        new URL(str); // TODO: replace with canParse after we drop node v18
        return true;
    } catch {
        return false;
    }
}

class PaginationService {
    public validateConfiguration(paginationConfig: Pagination): void {
        if (!paginationConfig.type) {
            throw new Error('Pagination type is required');
        }

        const { type } = paginationConfig;

        if (paginationConfig.type === 'cursor') {
            const cursorPagination = paginationConfig;
            if (!cursorPagination.cursor_name_in_request) {
                throw new Error('Param cursor_name_in_request is required for cursor pagination');
            }
            if (!cursorPagination.cursor_path_in_response) {
                throw new Error('Param cursor_path_in_response is required for cursor pagination');
            }

            if (paginationConfig.limit && !paginationConfig.limit_name_in_request) {
                throw new Error('Param limit_name_in_request is required for cursor pagination when limit is set');
            }
        } else if (type === 'link') {
            const linkPagination = paginationConfig;
            if (!linkPagination.link_rel_in_response_header && !linkPagination.link_path_in_response_body) {
                throw new Error('Either param link_rel_in_response_header or link_path_in_response_body is required for link pagination');
            }
        } else if (type === 'offset') {
            const offsetPagination = paginationConfig;
            if (!offsetPagination.offset_name_in_request) {
                throw new Error('Param offset_name_in_request is required for offset pagination');
            }
        } else {
            throw new Error(`Pagination type ${type} is not supported. Only cursor, link and offset pagination types are supported.`);
        }
    }

    public async *cursor<T>(
        config: UserProvidedProxyConfiguration,
        paginationConfig: CursorPagination,
        updatedBodyOrParams: Record<string, any>,
        passPaginationParamsInBody: boolean,
        proxy: (config: UserProvidedProxyConfiguration) => Promise<AxiosResponse>
    ): AsyncGenerator<T[], undefined, void> {
        const cursorPagination: CursorPagination = paginationConfig;

        let nextCursor: string | number | undefined;

        do {
            if (typeof nextCursor !== 'undefined') {
                updatedBodyOrParams[cursorPagination.cursor_name_in_request] = nextCursor;
            }

            this.updateConfigBodyOrParams(passPaginationParamsInBody, config, updatedBodyOrParams);

            const response: AxiosResponse = await proxy(config);

            const responseData: T[] = cursorPagination.response_path ? get(response.data, cursorPagination.response_path) : response.data;

            if (!responseData || !responseData.length) {
                return;
            }

            yield responseData;

            nextCursor = get(response.data, cursorPagination.cursor_path_in_response);
            if (typeof nextCursor === 'string') {
                nextCursor = nextCursor.trim();
                if (!nextCursor) {
                    nextCursor = undefined;
                }
            } else if (typeof nextCursor !== 'number') {
                nextCursor = undefined;
            }
        } while (typeof nextCursor !== 'undefined');
    }

    public async *link<T>(
        config: UserProvidedProxyConfiguration,
        paginationConfig: LinkPagination,
        updatedBodyOrParams: Record<string, any>,
        passPaginationParamsInBody: boolean,
        proxy: (config: UserProvidedProxyConfiguration) => Promise<AxiosResponse>
    ): AsyncGenerator<T[], undefined, void> {
        const linkPagination: LinkPagination = paginationConfig;

        this.updateConfigBodyOrParams(passPaginationParamsInBody, config, updatedBodyOrParams);

        while (true) {
            const response: AxiosResponse = await proxy(config);

            const responseData: T[] = paginationConfig.response_path ? get(response.data, paginationConfig.response_path) : response.data;
            if (!responseData.length) {
                return;
            }

            yield responseData;

            const nextPageLink: string | undefined = this.getNextPageLinkFromBodyOrHeaders(linkPagination, response, paginationConfig);

            if (!nextPageLink) {
                return;
            }

            if (!isValidURL(nextPageLink)) {
                // some providers only send path+query params in the link so we can immediately assign those to the endpoint
                config.endpoint = nextPageLink;
            } else {
                const url: URL = new URL(nextPageLink);
                config.endpoint = url.pathname + url.search;
            }

            delete config.params;
        }
    }

    public async *offset<T>(
        config: UserProvidedProxyConfiguration,
        paginationConfig: OffsetPagination,
        updatedBodyOrParams: Record<string, any>,
        passPaginationParamsInBody: boolean,
        proxy: (config: UserProvidedProxyConfiguration) => Promise<AxiosResponse>
    ): AsyncGenerator<T[], undefined, void> {
        const offsetPagination: OffsetPagination = paginationConfig;
        const offsetParameterName: string = offsetPagination.offset_name_in_request;
        const offsetCalculationMethod: OffsetCalculationMethod = offsetPagination.offset_calculation_method || 'by-response-size';
        let offset = offsetPagination.offset_start_value || 0;

        while (true) {
            updatedBodyOrParams[offsetParameterName] = passPaginationParamsInBody ? offset : String(offset);

            this.updateConfigBodyOrParams(passPaginationParamsInBody, config, updatedBodyOrParams);

            const response: AxiosResponse = await proxy(config);

            const responseData: T[] = paginationConfig.response_path ? get(response.data, paginationConfig.response_path) : response.data;
            if (!responseData || !responseData.length) {
                return;
            }

            yield responseData;

            if (paginationConfig['limit'] && responseData.length < paginationConfig['limit']) {
                return;
            }

            if (responseData.length < 1) {
                // Last page was empty so no need to fetch further
                return;
            }

            if (offsetCalculationMethod === 'per-page') {
                offset++;
            } else {
                offset += responseData.length;
            }
        }
    }

    private updateConfigBodyOrParams(passPaginationParamsInBody: boolean, config: UserProvidedProxyConfiguration, updatedBodyOrParams: Record<string, string>) {
        if (passPaginationParamsInBody) {
            config.data = updatedBodyOrParams;
        } else {
            config.params = updatedBodyOrParams;
        }
    }

    private getNextPageLinkFromBodyOrHeaders(linkPagination: LinkPagination, response: AxiosResponse, paginationConfig: Pagination) {
        if (linkPagination.link_rel_in_response_header) {
            const linkHeader = parseLinksHeader(response.headers['link']);
            return linkHeader?.[linkPagination.link_rel_in_response_header]?.url;
        } else if (linkPagination.link_path_in_response_body) {
            return get(response.data, linkPagination.link_path_in_response_body);
        }

        throw Error(`Either 'link_rel_in_response_header' or 'link_path_in_response_body' should be specified for '${paginationConfig.type}' pagination`);
    }
}

export default new PaginationService();
