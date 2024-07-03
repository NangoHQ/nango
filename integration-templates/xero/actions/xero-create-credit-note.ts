import type { NangoAction, CreditNoteActionResponse, CreditNote, ActionErrorResponse } from '../../models';
import { getTenantId } from '../helpers/get-tenant-id.js';
import { toFailedCreditNote, toCreditNote } from '../mappers/to-credit-note.js';

export default async function runAction(nango: NangoAction, input: CreditNote[]): Promise<CreditNoteActionResponse> {
    const tenant_id = await getTenantId(nango);

    // Validate the credit notes:

    // 1) Contact is required
    const invalidCreditNotes = input.filter((x: any) => !x.external_contact_id || x.fees.length === 0);
    if (invalidCreditNotes.length > 0) {
        throw new nango.ActionError<ActionErrorResponse>({
            message: `A contact id and at least one line item is required for every credit note.\nInvalid notes:\n${JSON.stringify(
                invalidCreditNotes,
                null,
                4
            )}`
        });
    }

    // 2) 1+ valid credit note item is required
    for (const creditNote of input) {
        const invalidCreditNoteItems = creditNote.fees.filter((x: any) => !x.description || x.description.length < 1);
        if (invalidCreditNoteItems.length > 0) {
            throw new Error(`Every credit note item needs at least a description with 1 character.\n
            Invalid items:\n${JSON.stringify(invalidCreditNoteItems, null, 4)}\n
            Credit note: ${JSON.stringify(creditNote, null, 4)}`);
        }
    }

    const config = {
        endpoint: 'api.xro/2.0/CreditNotes',
        headers: {
            'xero-tenant-id': tenant_id
        },
        params: {
            summarizeErrors: 'false'
        },
        data: {
            CreditNotes: input.map(mapCreditNoteToXero)
        }
    };

    const res = await nango.post(config);
    const creditNotes = res.data.CreditNotes;

    const failedCreditNotes = creditNotes.filter((x: any) => x.HasErrors);
    if (failedCreditNotes.length > 0) {
        await nango.log(
            `Some credit notes could not be created in Xero due to validation errors. Note that the remaining credit notes (${
                input.length - failedCreditNotes.length
            }) were created successfully. Affected credit notes:\n${JSON.stringify(failedCreditNotes, null, 4)}`,
            { level: 'error' }
        );
    }
    const succeededCreditNotes = creditNotes.filter((x: any) => !x.HasErrors);

    const response = {
        succeededCreditNotes: succeededCreditNotes.map(toCreditNote),
        failedCreditNotes: failedCreditNotes.map(toFailedCreditNote)
    } as CreditNoteActionResponse;

    return response;
}

function mapCreditNoteToXero(creditNote: CreditNote) {
    const xeroCreditNote: Record<string, any> = {
        Type: creditNote.type,
        Contact: {
            ContactID: creditNote.external_contact_id
        },
        LineItems: []
    };

    if (creditNote.number) {
        xeroCreditNote['CreditNoteNumber'] = creditNote.number;
    }

    if (creditNote.reference) {
        xeroCreditNote['Reference'] = creditNote.reference;
    }

    if (creditNote.status) {
        xeroCreditNote['Status'] = creditNote.status;
    }

    if (creditNote.currency) {
        xeroCreditNote['CurrencyCode'] = creditNote.currency;
    }

    if (creditNote.issuing_date) {
        const issuingDate = new Date(creditNote.issuing_date);
        xeroCreditNote['Date'] = issuingDate.toISOString().split('T')[0];
    }

    for (const item of creditNote.fees) {
        const xeroItem: Record<string, any> = {
            Description: item.description,
            AccountCode: item.account_code
        };

        if (item.item_code) {
            xeroItem['ItemCode'] = item.item_code;
        }

        if (item.units) {
            xeroItem['Quantity'] = item.units;
        }

        if (item.precise_unit_amount) {
            xeroItem['UnitAmount'] = item.precise_unit_amount;
        }

        if (item.amount_cents) {
            xeroItem['LineAmount'] = item.amount_cents / 100;
        }

        if (item.taxes_amount_cents) {
            xeroItem['TaxAmount'] = item.taxes_amount_cents / 100;
        }

        xeroCreditNote['LineItems'].push(xeroItem);
    }

    return xeroCreditNote;
}
