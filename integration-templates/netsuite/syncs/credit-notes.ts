import type { NangoSync, NetsuiteCreditNote, NetsuiteCreditNoteLine, ProxyConfiguration } from '../../models';
import type { NS_CreditNote, NSAPI_GetResponse } from '../types';
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
                params: {
                    expandSubResources: 'true'
                },
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

            for (const item of creditNote.data.item.items) {
                const mappedCreditNoteLine: NetsuiteCreditNoteLine = {
                    itemId: item.item?.id || '',
                    quantity: item.quantity ? Number(item.quantity) : 0,
                    amount: item.amount ? Number(item.amount) : 0
                };
                if (item.taxDetailsReference) {
                    mappedCreditNoteLine.vatCode = item.taxDetailsReference;
                }
                if (item.item?.refName) {
                    mappedCreditNoteLine.description = item.item?.refName;
                }
                mappedCreditNote.lines.push(mappedCreditNoteLine);
            }

            mappedCreditNotes.push(mappedCreditNote);
        }

        await nango.batchSave<NetsuiteCreditNote>(mappedCreditNotes, 'NetsuiteCreditNote');
    }
}
