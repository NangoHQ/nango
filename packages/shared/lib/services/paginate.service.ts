import parseLinksHeader from 'parse-link-header';
import * as _ from 'lodash';
import type { Pagination, AxiosResponse, ProxyConfiguration, CursorPagination, OffsetPagination, LinkPagination } from '../sdk/sync.js';
import { isValidHttpUrl } from '../utils/utils.js';

class PaginationService {
    public async *cursor<T>(
        config: ProxyConfiguration,
        paginationConfig: CursorPagination,
        updatedBodyOrParams: Record<string, any>,
        passPaginationParamsInBody: boolean,
        proxy: (config: ProxyConfiguration) => Promise<AxiosResponse>
    ): AsyncGenerator<T[], undefined, void> {
        const cursorPagination: CursorPagination = paginationConfig as CursorPagination;

        let nextCursor: string | undefined;

        while (true) {
            if (nextCursor) {
                updatedBodyOrParams[cursorPagination.cursor_name_in_request] = nextCursor;
            }

            this.updateConfigBodyOrParams(passPaginationParamsInBody, config, updatedBodyOrParams);

            const response: AxiosResponse = await proxy(config);

            const responseData: T[] = cursorPagination.response_path ? _.get(response.data, cursorPagination.response_path) : response.data;

            if (!responseData.length) {
                return;
            }

            yield responseData;

            nextCursor = _.get(response.data, cursorPagination.cursor_path_in_response);

            if (!nextCursor || nextCursor.trim().length === 0) {
                return;
            }
        }
    }

    public async *link<T>(
        config: ProxyConfiguration,
        paginationConfig: LinkPagination,
        updatedBodyOrParams: Record<string, any>,
        passPaginationParamsInBody: boolean,
        proxy: (config: ProxyConfiguration) => Promise<AxiosResponse>
    ): AsyncGenerator<T[], undefined, void> {
        const linkPagination: LinkPagination = paginationConfig as LinkPagination;

        this.updateConfigBodyOrParams(passPaginationParamsInBody, config, updatedBodyOrParams);

        while (true) {
            const response: AxiosResponse = await proxy(config);

            const responseData: T[] = paginationConfig.response_path ? _.get(response.data, paginationConfig.response_path) : response.data;
            if (!responseData.length) {
                return;
            }

            yield responseData;

            const nextPageLink: string | undefined = this.getNextPageLinkFromBodyOrHeaders(linkPagination, response, paginationConfig);

            if (!nextPageLink) {
                return;
            }

            if (!isValidHttpUrl(nextPageLink)) {
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
        config: ProxyConfiguration,
        paginationConfig: OffsetPagination,
        updatedBodyOrParams: Record<string, any>,
        passPaginationParamsInBody: boolean,
        proxy: (config: ProxyConfiguration) => Promise<AxiosResponse>
    ): AsyncGenerator<T[], undefined, void> {
        const offsetPagination: OffsetPagination = paginationConfig as OffsetPagination;
        const offsetParameterName: string = offsetPagination.offset_name_in_request;
        let offset = 0;

        while (true) {
            updatedBodyOrParams[offsetParameterName] = `${offset}`;

            this.updateConfigBodyOrParams(passPaginationParamsInBody, config, updatedBodyOrParams);

            const response: AxiosResponse = await proxy(config);

            const responseData: T[] = paginationConfig.response_path ? _.get(response.data, paginationConfig.response_path) : response.data;
            if (!responseData.length) {
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

            offset += responseData.length;
        }
    }

    private updateConfigBodyOrParams(passPaginationParamsInBody: boolean, config: ProxyConfiguration, updatedBodyOrParams: Record<string, string>) {
        passPaginationParamsInBody ? (config.data = updatedBodyOrParams) : (config.params = updatedBodyOrParams);
    }

    private getNextPageLinkFromBodyOrHeaders(linkPagination: LinkPagination, response: AxiosResponse<any, any>, paginationConfig: Pagination) {
        if (linkPagination.link_rel_in_response_header) {
            const linkHeader = parseLinksHeader(response.headers['link']);
            return linkHeader?.[linkPagination.link_rel_in_response_header]?.url;
        } else if (linkPagination.link_path_in_response_body) {
            return _.get(response.data, linkPagination.link_path_in_response_body);
        }

        throw Error(`Either 'link_rel_in_response_header' or 'link_path_in_response_body' should be specified for '${paginationConfig.type}' pagination`);
    }
}

export default new PaginationService();
