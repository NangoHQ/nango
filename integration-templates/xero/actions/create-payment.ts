import type { FailedPayment, NangoAction, CreatePayment, Payment, PaymentActionResponse, ActionErrorResponse } from '../../models';
import { getTenantId } from '../helpers/get-tenant-id.js';
import { parseDate } from '../utils.js';

export default async function runAction(nango: NangoAction, input: CreatePayment[]): Promise<PaymentActionResponse> {
    const tenant_id = await getTenantId(nango);

    // Validate the credit notes:

    // Check if invoice_id or credit_note_id is present
    let invalidPayments = input.filter((x: any) => (!x.invoice_id && !x.credit_note_id) || (x.invoice_id && x.credit_note_id));
    if (invalidPayments.length > 0) {
        throw new nango.ActionError<ActionErrorResponse>({
            message: `Payment needs to have exactly one of either invoice_id or credit_note_id set. You either specified none or both.\nInvalid payments:\n${JSON.stringify(
                invalidPayments,
                null,
                4
            )}`
        });
    }

    // Check for required fields
    invalidPayments = input.filter((x: any) => (!x.account_code && !x.account_id) || !x.date || !x.amount_cents);
    if (invalidPayments.length > 0) {
        throw new nango.ActionError<ActionErrorResponse>({
            message: `Some payments are missing required fields.\nInvalid payments:\n${JSON.stringify(invalidPayments, null, 4)}`
        });
    }

    const config = {
        endpoint: 'api.xro/2.0/Payments',
        headers: {
            'xero-tenant-id': tenant_id
        },
        params: {
            summarizeErrors: 'false'
        },
        data: {
            Payments: input.map(mapPaymentToXero)
        }
    };

    const res = await nango.put(config);
    const payments = res.data.Payments;

    const failedPayments = payments.filter((x: any) => x.HasValidationErrors);
    if (failedPayments.length > 0) {
        await nango.log(
            `Some payments could not be created in Xero due to validation errors. Note that the remaining payments (${
                input.length - failedPayments.length
            }) were created successfully. Affected payments:\n${JSON.stringify(failedPayments, null, 4)}`,
            { level: 'error' }
        );
    }
    const succeededPayments = payments.filter((x: any) => !x.HasValidationErrors);

    const response = {
        succeededPayment: succeededPayments.map(mapXeroPayment),
        failedPayments: failedPayments.map(mapFailedXeroPayment)
    } as PaymentActionResponse;

    return response;
}

function mapPaymentToXero(payment: CreatePayment) {
    const xeroPayment: Record<string, any> = {
        Amount: payment.amount_cents / 100
    };

    if (payment.account_code) {
        xeroPayment['Account'] = {
            Code: payment.account_code
        };
    }

    if (payment.account_id) {
        xeroPayment['Account'] = {
            ...xeroPayment['Account'],
            AccountID: payment.account_id
        };
    }

    if (payment.date) {
        const date = new Date(payment.date);
        xeroPayment['Date'] = date.toISOString().split('T')[0];
    }

    if (payment.invoice_id) {
        xeroPayment['Invoice'] = {
            InvoiceID: payment.invoice_id
        };
    }

    if (payment.credit_note_id) {
        xeroPayment['CreditNote'] = {
            CreditNoteID: payment.credit_note_id
        };
    }

    return xeroPayment;
}

function mapFailedXeroPayment(xeroPayment: any): FailedPayment {
    const failedPayment = mapXeroPayment(xeroPayment) as FailedPayment;
    failedPayment.validation_errors = xeroPayment.ValidationErrors;
    return failedPayment;
}

// NOTE: The structure returned by PUT /Payments is NOT the same
// as returned by GET /Payments
// This mapping function is correct, do not use the same one as for the sync
function mapXeroPayment(xeroPayment: any): Payment {
    const payment = {
        id: xeroPayment.PaymentID,
        status: xeroPayment.Status,
        invoice_id: xeroPayment.Invoice ? xeroPayment.Invoice.InvoiceID : null,
        credit_note_id: xeroPayment.CreditNote ? xeroPayment.CreditNote.CreditNoteID : null,
        account_code: xeroPayment.Account.Code,
        date: parseDate(xeroPayment.Date).toISOString(),
        amount_cents: parseFloat(xeroPayment.Amount) * 100
    };

    return payment;
}
