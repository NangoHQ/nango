import type { NangoSync, NetsuiteCreditNote, NetsuiteCreditNoteLine, ProxyConfiguration } from '../../models';
import type { NS_CreditNote, NS_Item, NSAPI_GetResponse, NSAPI_GetResponses, NSAPI_Links } from '../types';
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
            const itemIds = items.data.items.map((itemLink: NSAPI_Links) => {
                return itemLink.links?.find((link) => link.rel === 'self')?.href?.match(/\/item\/(\d+)/)?.[1];
            });
            for (const itemId of itemIds) {
                const item: NSAPI_GetResponse<NS_Item> = await nango.get({
                    endpoint: `/creditmemo/${creditNoteLink.id}/item/${itemId}`,
                    retries
                });
                const mappedCreditNoteLine: NetsuiteCreditNoteLine = {
                    itemId: item.data.item?.id || '',
                    quantity: item.data.quantity ? Number(item.data.quantity) : 0,
                    amount: item.data.amount ? Number(item.data.amount) : 0
                };
                if (item.data.taxDetailsReference) {
                    mappedCreditNoteLine.vatCode = item.data.taxDetailsReference;
                }
                if (item.data.item?.refName) {
                    mappedCreditNoteLine.description = item.data.item?.refName;
                }
                mappedCreditNote.lines.push(mappedCreditNoteLine);
            }

            mappedCreditNotes.push(mappedCreditNote);
        }

        await nango.batchSave<NetsuiteCreditNote>(mappedCreditNotes, 'NetsuiteCreditNote');
    }
}
