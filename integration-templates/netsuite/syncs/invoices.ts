import type { NangoSync, NetsuiteInvoice, NetsuiteInvoiceLine, ProxyConfiguration } from '../../models';
import type { NS_Invoice, NSAPI_GetResponse } from '../types';
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
                params: {
                    expandSubResources: 'true'
                },
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

            for (const item of invoice.data.item.items) {
                const line: NetsuiteInvoiceLine = {
                    itemId: item.item?.id || '',
                    quantity: item.quantity ? Number(item.quantity) : 0,
                    amount: item.amount ? Number(item.amount) : 0
                };
                if (item.taxDetailsReference) {
                    line.vatCode = item.taxDetailsReference;
                }
                if (item.item?.refName) {
                    line.description = item.item?.refName;
                }
                mappedInvoice.lines.push(line);
            }

            mappedInvoices.push(mappedInvoice);
        }

        await nango.batchSave<NetsuiteInvoice>(mappedInvoices, 'NetsuiteInvoice');
    }
}
