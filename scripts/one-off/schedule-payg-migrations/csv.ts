export interface MigrationRow {
    accountId: string;
    currentPlan: string;
}

/** Minimal CSV reader supporting quoted fields and escaped quotes. */
function readCsvRows(contents: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let quoted = false;

    for (let index = 0; index < contents.length; index++) {
        const character = contents[index];
        if (character === undefined) {
            continue;
        }
        if (quoted) {
            if (character === '"') {
                if (contents[index + 1] === '"') {
                    field += '"';
                    index++;
                } else {
                    quoted = false;
                }
            } else {
                field += character;
            }
            continue;
        }

        if (character === '"') {
            if (field.length !== 0) {
                throw new Error('Invalid CSV: a quote must start at the beginning of a field');
            }
            quoted = true;
        } else if (character === ',') {
            row.push(field);
            field = '';
        } else if (character === '\n') {
            row.push(field);
            rows.push(row);
            row = [];
            field = '';
        } else if (character !== '\r') {
            field += character;
        }
    }

    if (quoted) {
        throw new Error('Invalid CSV: unterminated quoted field');
    }
    if (field.length > 0 || row.length > 0) {
        row.push(field);
        rows.push(row);
    }

    return rows.filter((cells) => cells.some((cell) => cell.trim().length > 0));
}

export function parseMigrationCsv(contents: string): MigrationRow[] {
    const [header, ...data] = readCsvRows(contents);
    if (!header) {
        throw new Error('CSV is empty');
    }

    const normalizedHeader = header.map((column, index) => (index === 0 ? column.replace(/^\uFEFF/, '').trim() : column.trim()));
    const required = ['account_id', 'current_plan', 'with_growth_addon'];
    if (normalizedHeader.length !== required.length || required.some((column, index) => normalizedHeader[index] !== column)) {
        throw new Error(`CSV headers must be exactly: ${required.join(', ')}`);
    }

    const rows: MigrationRow[] = [];
    const accountIds = new Set<string>();
    for (const [index, cells] of data.entries()) {
        const line = index + 2;
        if (cells.length !== required.length) {
            throw new Error(`CSV row ${line} must contain exactly ${required.length} columns`);
        }

        const [accountIdCell = '', currentPlanCell = '', withGrowthAddonCell = ''] = cells;
        const accountId = accountIdCell.trim();
        const currentPlan = currentPlanCell.trim();
        const withGrowthAddon = withGrowthAddonCell.trim().toLowerCase();
        if (!/^\d+$/.test(accountId) || !Number.isSafeInteger(Number(accountId)) || Number(accountId) <= 0) {
            throw new Error(`CSV row ${line} has an invalid account_id: ${accountId || '(empty)'}`);
        }
        if (!currentPlan) {
            throw new Error(`CSV row ${line} has an empty current_plan`);
        }
        if (withGrowthAddon !== 'true' && withGrowthAddon !== 'false') {
            throw new Error(`CSV row ${line} has an invalid with_growth_addon value: ${withGrowthAddon || '(empty)'}`);
        }
        if (accountIds.has(accountId)) {
            throw new Error(`CSV row ${line} duplicates account_id: ${accountId}`);
        }

        accountIds.add(accountId);
        rows.push({ accountId, currentPlan });
    }

    return rows;
}
