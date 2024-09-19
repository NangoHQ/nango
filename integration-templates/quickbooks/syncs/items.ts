import type { NangoSync, Item } from '../../models';
import type { QuickBooksItem } from '../types';
import { paginate } from '../helpers/paginate.js';
import { toItem } from '../mappers/toItem.js';
import type { PaginationParams } from '../helpers/paginate';

/**
 * Fetches item data from QuickBooks API and saves it in batch.
 * Handles both active and archived items, saving or deleting them based on their status.
 * For detailed endpoint documentation, refer to:
 * https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/item#query-an-item
 *
 * @param nango The NangoSync instance used for making API calls and saving data.
 * @returns A promise that resolves when the data has been successfully fetched and saved.
 */
export default async function fetchData(nango: NangoSync): Promise<void> {
    const config: PaginationParams = {
        model: 'Item',
        additionalFilter: 'Active IN (true, false)'
    };

    let allItems: QuickBooksItem[] = [];

    // Fetch all items with pagination
    for await (const items of paginate<QuickBooksItem>(nango, config)) {
        allItems = [...allItems, ...items];
    }

    // Filter and process active items
    const activeItems = allItems.filter((item) => item.Active);
    const mappedActiveItems = activeItems.map(toItem);
    await nango.batchSave<Item>(mappedActiveItems, 'Item');

    // Handle archived items only if it's an incremental refresh
    if (nango.lastSyncDate) {
        const archivedItems = allItems.filter((item) => !item.Active);
        const mappedArchivedItems = archivedItems.map(toItem);
        await nango.batchDelete<Item>(mappedArchivedItems, 'Item');
    }
}
