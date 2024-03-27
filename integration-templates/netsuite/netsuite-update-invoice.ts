import type {
  NangoAction,
  Invoice,
  InvoiceActionResponse,
  FailedInvoice,
} from "./models";

export default async function runAction(
  nango: NangoAction,
  input?: Invoice[]
): Promise<InvoiceActionResponse> {
  const response: InvoiceActionResponse = {
    succeededInvoices: [],
    failedInvoices: [],
  };
  if (!input?.length) {
    throw new Error(
      `You must pass an array of invoice! Received: ${JSON.stringify(input)}`
    );
  }
  for (const invoice of input) {
    const netsuiteInvoice = {
      entity: invoice.external_contact_id,
      tranDate: invoice.issuing_date,
      tranId: invoice.number,
      otherRefNum: invoice.purchase_order,
      item: {
        items: invoice.fees?.map((fee) => {
          const netsuiteItem = {
            item: { id: fee.item_id },
            quantity: fee.units,
            account: { id: fee.account_code },
          };
          if (fee.amount_cents) {
            netsuiteItem["amount"] = fee.amount_cents;
          }
          if (fee.rate) {
            netsuiteItem["rate"] = fee.rate;
          }
          if (fee.price) {
            netsuiteItem["price"] = { id: fee.price };
          }
          return netsuiteItem;
        }),
      },
    };
    await nango
      .patch({
        endpoint: `/invoice/${invoice.id}`,
        data: netsuiteInvoice,
      })
      .then((_) => {
        response.succeededInvoices.push(invoice);
      })
      .catch((errorRes) => {
        const details = errorRes.response?.data["o:errorDetails"]?.map(
          (detail: { detail: string }) => detail.detail
        ) || ["Unknown error"];
        const faildedInvoice: FailedInvoice = {
          ...invoice,
          validation_errors: details,
        };
        response.failedInvoices.push(faildedInvoice);
      });
  }
  return response;
}
