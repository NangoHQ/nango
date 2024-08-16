import type { NangoSync, NetsuiteInvoice, ProxyConfiguration } from '../../models';
import type { NS_Invoice, NS_Item, NSAPI_GetResponse, NSAPI_GetResponses } from '../types';
import { paginate } from '../helpers/pagination.js';

const retries = 3;

export default async function fetchData(nango: NangoSync): Promise<void> {
    const proxyConfig: ProxyConfiguration = {
        endpoint: '/invoice',
        retries
    };
    for await (const invoices of paginate<{ id: string }>({ nango, proxyConfig })) {
        await nango.log('Listed invoices', { total: invoices.length });

        const mappedInvoices: NetsuiteInvoice[] = [];
        for (const invoiceLink of invoices) {
            const invoice: NSAPI_GetResponse<NS_Invoice> = await nango.get({
                endpoint: `/invoice/${invoiceLink.id}`,
                retries
            });
            if (!invoice.data) {
                await nango.log('Invoice not found', { id: invoiceLink.id });
                continue;
            }
            const mappedInvoice: NetsuiteInvoice = {
                id: invoice.data.id,
                customerId: invoice.data.entity?.id || '',
                currency: invoice.data.currency?.refName || '',
                description: invoice.data.memo || null,
                createdAt: invoice.data.tranDate || '',
                lines: [],
                total: invoice.data.total ? Number(invoice.data.total) : 0,
                status: invoice.data.status?.id || ''
            };

            const items: NSAPI_GetResponses<any> = await nango.get({
                endpoint: `/invoice/${invoiceLink.id}/item`,
                retries
            });
            const itemIds = items.data.items.map((itemLink) => {
                return itemLink.links?.find((link: any) => link.rel === 'self').href.match(/\/item\/(\d+)/)?.[1];
            });
            for (const itemId of itemIds) {
                const item: NSAPI_GetResponse<NS_Item> = await nango.get({
                    endpoint: `/invoice/${invoiceLink.id}/item/${itemId}`,
                    retries
                });
                mappedInvoice.lines.push({
                    itemId: item.data.item?.id || '',
                    quantity: item.data.quantity ? Number(item.data.quantity) : 0,
                    amount: item.data.amount ? Number(item.data.amount) : 0,
                    ...(item.data.taxDetailsReference && { vatCode: item.data.taxDetailsReference }),
                    ...(item.data.item?.refName && { description: item.data.item?.refName })
                });
            }

            mappedInvoices.push(mappedInvoice);
        }

        await nango.batchSave<NetsuiteInvoice>(mappedInvoices, 'NetsuiteInvoice');
    }
}
