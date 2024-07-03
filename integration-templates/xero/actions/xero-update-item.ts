import type { NangoAction, ItemActionResponse, FailedItem, Item, ActionErrorResponse } from '../../models';
import { getTenantId } from '../helpers/get-tenant-id.js';

export default async function runAction(nango: NangoAction, input: Item[]): Promise<ItemActionResponse> {
    const tenant_id = await getTenantId(nango);

    // Validate the credit notes:

    // Check for required fields
    const invalidItems = input.filter((x: any) => !x.item_code);
    if (invalidItems.length > 0) {
        throw new nango.ActionError<ActionErrorResponse>({
            message: `Some items are missing required fields.\nInvalid items:\n${JSON.stringify(invalidItems, null, 4)}`
        });
    }

    const config = {
        endpoint: 'api.xro/2.0/Items',
        headers: {
            'xero-tenant-id': tenant_id
        },
        data: {
            Items: input.map(mapItemToXero)
        }
    };

    const res = await nango.post(config);
    const items = res.data.Items;

    const failedItems = items.filter((x: any) => x.ValidationErrors.length > 0);
    if (failedItems.length > 0) {
        await nango.log(
            `Some items could not be updated in Xero due to validation errors. Note that the remaining items (${
                input.length - failedItems.length
            }) were updated successfully. Affected items:\n${JSON.stringify(failedItems, null, 4)}`,
            { level: 'error' }
        );
    }
    const succeededItems = items.filter((x: any) => x.ValidationErrors.length === 0);

    const response = {
        succeededItems: succeededItems.map(mapXeroItem),
        failedItems: failedItems.map(mapFailedXeroItem)
    } as ItemActionResponse;

    return response;
}

function mapItemToXero(item: Item) {
    const xeroItem: Record<string, any> = {
        ItemID: item.id,
        Code: item.item_code
    };

    if (item.name) {
        xeroItem['Name'] = item.name;
    }

    if (item.description) {
        xeroItem['Description'] = item.description;
    }

    if (item.account_code) {
        xeroItem['SalesDetails'] = {
            AccountCode: item.account_code
        };
    }

    return xeroItem;
}

function mapFailedXeroItem(xeroItem: any): FailedItem {
    const failedItem = mapXeroItem(xeroItem) as FailedItem;
    failedItem.validation_errors = xeroItem.ValidationErrors;
    return failedItem;
}

function mapXeroItem(xeroItem: any): Item {
    return {
        id: xeroItem.ItemID,
        item_code: xeroItem.Code,
        name: xeroItem.Name,
        description: xeroItem.Description,
        account_code: xeroItem.SalesDetails ? xeroItem.SalesDetails.AccountCode : null
    } as Item;
}
