import type { NangoSync, NetsuiteCreditNote, ProxyConfiguration } from '../../models';
import type { NS_CreditNote, NS_Item, NSAPI_GetResponse, NSAPI_GetResponses } from '../types';
import { paginate } from '../helpers/pagination.js';

const retries = 3;

export default async function fetchData(nango: NangoSync): Promise<void> {
    const proxyConfig: ProxyConfiguration = {
        endpoint: '/creditmemo',
        retries
    };
    for await (const creditNotes of paginate<{ id: string }>({ nango, proxyConfig })) {
        await nango.log('Listed credit notes', { total: creditNotes.length });

        const mappedCreditNotes: NetsuiteCreditNote[] = [];
        for (const creditNoteLink of creditNotes) {
            const creditNote: NSAPI_GetResponse<NS_CreditNote> = await nango.get({
                endpoint: `/creditmemo/${creditNoteLink.id}`,
                retries
            });
            if (!creditNote.data) {
                await nango.log('Credit Note not found', { id: creditNoteLink.id });
                continue;
            }
            const mappedCreditNote: NetsuiteCreditNote = {
                id: creditNote.data.id,
                customerId: creditNote.data.entity?.id || '',
                currency: creditNote.data.currency?.refName || '',
                description: creditNote.data.memo || null,
                createdAt: creditNote.data.tranDate || '',
                lines: [],
                total: creditNote.data.total ? Number(creditNote.data.total) : 0,
                status: creditNote.data.status?.refName || ''
            };

            const items: NSAPI_GetResponses<any> = await nango.get({
                endpoint: `/creditmemo/${creditNoteLink.id}/item`,
                retries
            });
            const itemIds = items.data.items.map((itemLink) => {
                return itemLink.links?.find((link: any) => link.rel === 'self').href.match(/\/item\/(\d+)/)?.[1];
            });
            for (const itemId of itemIds) {
                const item: NSAPI_GetResponse<NS_Item> = await nango.get({
                    endpoint: `/creditmemo/${creditNoteLink.id}/item/${itemId}`,
                    retries
                });
                mappedCreditNote.lines.push({
                    itemId: item.data.item?.id || '',
                    quantity: item.data.quantity ? Number(item.data.quantity) : 0,
                    amountNet: item.data.amount ? Number(item.data.amount) : 0,
                    ...(item.data.taxDetailsReference && { vatCode: item.data.taxDetailsReference }),
                    ...(item.data.item?.refName && { description: item.data.item?.refName })
                });
            }

            mappedCreditNotes.push(mappedCreditNote);
        }

        await nango.batchSave<NetsuiteCreditNote>(mappedCreditNotes, 'NetsuiteCreditNote');
    }
}
