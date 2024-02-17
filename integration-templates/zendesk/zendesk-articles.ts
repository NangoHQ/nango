import type { NangoSync, ZendeskArticle } from './models';

async function getZendeskSubdomain(nango: NangoSync): Promise<string | undefined> {
    const response = await nango.getConnection();
    return response.connection_config['subdomain'];
}

interface ResultPage {
    pageNumber: number;
    articles: any[];
    nextPageEndpoint: string;
    totalResultCount: number;
    has_more: boolean;
}

export default async function fetchData(nango: NangoSync) {
    const subdomain = await getZendeskSubdomain(nango);
    let content: ResultPage | null = null;
    while (true) {
        content = await paginate(nango, 'get', '/api/v2/help_center/en-us/articles', content, 2, subdomain);

        if (!content?.articles) {
            break;
        }

        const ZendeskArticles = mapZendeskArticles(content.articles);
        await nango.batchSave(ZendeskArticles, 'ZendeskArticle');

        if (!content.has_more) {
            break;
        }
    }
}

async function paginate(
    nango: NangoSync,
    method: 'get' | 'post',
    endpoint: string,
    contentPage: ResultPage | null,
    pageSize = 250,
    subdomain: string | undefined
): Promise<ResultPage | null> {
    if (contentPage && contentPage.has_more == false) {
        return null;
    }

    await nango.log(`Fetching Zendesk Tickets - with pageCounter = ${contentPage ? contentPage.pageNumber : 0} & pageSize = ${pageSize}`);

    const res = await nango.get({
        baseUrlOverride: `https://${subdomain}.zendesk.com`,
        endpoint: `${contentPage ? contentPage.nextPageEndpoint : endpoint}`,
        method: method,
        params: { 'page[size]': `${pageSize}` },
        retries: 10 // Exponential backoff + long-running job = handles rate limits well.
    });

    if (!res.data) {
        return null;
    }

    const content = {
        pageNumber: contentPage ? contentPage.pageNumber + 1 : 1,
        articles: res.data.articles,
        has_more: res.data.meta.has_more,
        nextPageEndpoint: res.data.meta.has_more ? `${endpoint}?page[size]=${pageSize}&page[after]=${encodeURIComponent(res.data['meta'].after_cursor)}` : '', // not encoding results in error (cursor includes + in raw mode)
        totalResultCount: contentPage ? contentPage.totalResultCount + res.data.articles.length : res.data.articles.length
    };

    await nango.log(`Saving page with ${content.articles.length} records (total records: ${content.totalResultCount})`);

    return content;
}

function mapZendeskArticles(articles: any[]): ZendeskArticle[] {
    return articles.map((article: any) => {
        return {
            title: article.title,
            locale: article.locale,
            user_segment_id: article.user_segment_id,
            permission_group_id: article.permission_group_id,
            author_id: article.author_id,
            body: article.body,
            comments_disabled: article.comments_disabled,
            content_tag_ids: article.content_tag_ids,
            created_at: article.created_at,
            draft: article.draft,
            edited_at: article.edited_at,
            html_url: article.html_url,
            id: article.id,
            label_names: article.label_names,
            outdated: article.outdated,
            outdated_locales: article.outdated_locales,
            position: article.position,
            promoted: article.promoted,
            section_id: article.section_id,
            source_locale: article.source_locale,
            updated_at: article.updated_at,
            url: article.url,
            vote_count: article.vote_count,
            vote_sum: article.vote_sum
        };
    });
}
