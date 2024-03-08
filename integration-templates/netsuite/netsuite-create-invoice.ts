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
      .post({
        endpoint: `/invoice/`,
        data: netsuiteInvoice,
      })
      .then((res) => {
        const id = res.headers.location?.split("/").pop();
        if (!id) {
          throw new Error("Could not parse 'id' from Netsuite API response");
        }
        response.succeededInvoices.push({ ...invoice, id });
      })
      .catch((err) => {
        const details = err.response?.data["o:errorDetails"]?.map(
          (detail: { detail: string }) => detail.detail
        ) || [err.message];
        const faildedInvoice: FailedInvoice = {
          ...invoice,
          validation_errors: details,
        };
        response.failedInvoices.push(faildedInvoice);
      });
  }
  return response;
}
