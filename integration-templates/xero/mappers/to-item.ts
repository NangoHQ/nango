import type { FailedItem, Item } from '../../models';

export function toItem(xeroItem: any): Item {
    return {
        id: xeroItem.ItemID,
        item_code: xeroItem.Code,
        name: xeroItem.Name,
        description: xeroItem.Description,
        account_code: xeroItem.SalesDetails ? xeroItem.SalesDetails.AccountCode : null
    } as Item;
}

export function toXeroItem(item: Item) {
    const xeroItem: Record<string, any> = {
        Code: item.item_code
    };

    if (item.id) {
        xeroItem['ItemID'] = item.id;
    }

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

export function toFailedItem(xeroItem: any): FailedItem {
    const failedItem = toItem(xeroItem) as FailedItem;
    failedItem.validation_errors = xeroItem.ValidationErrors;
    return failedItem;
}
