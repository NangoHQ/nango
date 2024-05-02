import type { NangoSync, HubspotKnowledgeBase } from '../../models';

interface HubspotDetailsResponse {
    portalId: number;
    timeZone: string;
    accountType: string;
    currency: string;
    utcOffset: string;
    utcOffsetMilliseconds: number;
}

interface HubspotKnowledgeBaseResponse {
    id: number;
    type: string;
    fields: any;
}

async function* fetchPaginatedData(nango: NangoSync, portalId: number, limit = 50) {
    let offset = 0;

    while (true) {
        const response = await nango.get({
            endpoint: '/contentsearch/v2/search',
            params: {
                type: 'KNOWLEDGE_ARTICLE',
                term: 'a_b_c_d_e_f_g_h_i_j_k_l_m_n_o_p_q_r_s_t_u_v_w_x_y_z',
                portalId: portalId.toString(),
                limit: limit.toString(),
                offset: offset.toString()
            }
        });

        if (!response.data || response.data.total === 0) {
            return;
        }

        yield response.data.results;

        if (response.data.total <= offset + limit) {
            return;
        }

        offset += limit;
    }
}

export default async function fetchData(nango: NangoSync): Promise<void> {
    const portalResponse = await nango.get<HubspotDetailsResponse>({
        endpoint: '/integrations/v1/me'
    });

    if (!portalResponse.data || !portalResponse.data.portalId) {
        throw new Error('No portal id found');
    }

    for await (const pageData of fetchPaginatedData(nango, portalResponse.data.portalId)) {
        const kbs: HubspotKnowledgeBase[] = [];
        for (const result of pageData) {
            const response = await nango.get<HubspotKnowledgeBaseResponse>({
                endpoint: `/cms/v3/site-search/indexed-data/${result.id}`,
                params: {
                    type: 'KNOWLEDGE_ARTICLE'
                }
            });

            if (!response.data) {
                continue;
            }

            const { data } = response;

            kbs.push({
                id: data?.id.toString(),
                publishDate: data.fields.publishedDate.value,
                title: data.fields['title_nested.en'].value,
                content: data.fields['html_other_nested.en'].value,
                description: data.fields['description_nested.en'].value,
                category: data.fields['category_nested.en'].value
            });
        }
        await nango.batchSave<HubspotKnowledgeBase>(kbs, 'HubspotKnowledgeBase');
    }
}
