import type { Item, CreateItem, UpdateItem } from '../../models';
import type { QuickBooksItem } from '../types';
import { toDate } from '../utils/toDate.js';
import { mapReference } from '../utils/mapRefrence.js';

/**
 * Converts a QuickBooksItem object to a Item object.
 * Only includes essential properties mapped from QuickBooksItem.
 * @param item The QuickBooksItem object to convert.
 * @returns Item object representing QuickBooks item information.
 */
export function toItem(item: QuickBooksItem): Item {
    return {
        id: item.Id,
        name: item.Name,
        active: item.Active,
        type: item.Type,
        unit_price_cents: item.UnitPrice * 100,
        purchase_cost_cents: item.PurchaseCost * 100,
        qty_on_hand: item.QtyOnHand ?? null,
        inv_start_date: item.InvStartDate ? new Date(item.InvStartDate).toISOString() : null,
        track_qty_onHand: item.TrackQtyOnHand,
        description: item.Description ?? null,
        created_at: new Date(item.MetaData.CreateTime).toISOString(),
        updated_at: new Date(item.MetaData.LastUpdatedTime).toISOString()
    };
}

/**
 * Maps the item data from the input format to the QuickBooks item structure.
 * This function checks for the presence of various fields in the item object and maps them
 * to the corresponding fields expected by QuickBooks.
 *
 * @param {CreateItem | UpdateItem} item - The item data input object that needs to be mapped.
 * @returns {QuickBooksItem} - The mapped QuickBooks item object.
 */
export function toQuickBooksItem(item: CreateItem | UpdateItem): QuickBooksItem {
    const quickBooksItem: Partial<QuickBooksItem> = {};

    if ('id' in item && 'sync_token' in item) {
        const updateItem = item;
        quickBooksItem.Id = updateItem.id;
        quickBooksItem.SyncToken = updateItem.sync_token;
        quickBooksItem.sparse = true;
    }

    if (item.name) {
        quickBooksItem.Name = item.name;
    }

    if (item.type) {
        quickBooksItem.Type = item.type;
    }

    if (item.track_qty_onHand) {
        quickBooksItem.TrackQtyOnHand = item.track_qty_onHand;
    }

    if (item.qty_on_hand) {
        quickBooksItem.QtyOnHand = item.qty_on_hand;
    }

    if (item.inv_start_date) {
        quickBooksItem.InvStartDate = toDate(item.inv_start_date);
    }

    if (item.unit_price_cents) {
        quickBooksItem.UnitPrice = item.unit_price_cents / 100;
    }

    if (item.purchase_cost_cents) {
        quickBooksItem.PurchaseCost = item.purchase_cost_cents / 100;
    }

    if (item.qty_on_hand) {
        quickBooksItem.QtyOnHand = item.qty_on_hand;
    }

    const incomeAccountRef = mapReference(item.income_accountRef);
    if (incomeAccountRef) {
        quickBooksItem.IncomeAccountRef = incomeAccountRef;
    }

    const assetAccountRef = mapReference(item.asset_accountRef);
    if (assetAccountRef) {
        quickBooksItem.AssetAccountRef = assetAccountRef;
    }

    const expenseAccountRef = mapReference(item.expense_accountRef);
    if (expenseAccountRef) {
        quickBooksItem.ExpenseAccountRef = expenseAccountRef;
    }

    return quickBooksItem as QuickBooksItem;
}
