/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NangoSync, NotionRichPage } from './models';

export default async function fetchData(nango: NangoSync) {
    const pages = (await paginate(nango, 'post', '/v1/search', 'Notion pages', 100, false)).filter((result: any) => result.object === 'page');

    console.log('pages', JSON.stringify(pages, null, 2));

    const batchSize = 10;
    await nango.log(`Found ${pages.length} new/updated Notion pages to sync.`);

    for (let i = 0; i < pages.length; i += batchSize) {
        await nango.log(`Fetching plain text, in batch of ${batchSize} Notion pages, from page ${i + 1} (total pages: ${pages.length})`);
        const batchOfPages = pages.slice(i, Math.min(pages.length, i + batchSize));
        const pagesWithPlainText = await Promise.all(batchOfPages.map(async (page: any) => mapPage(nango, page)));
        console.log('pagesWithPlainText', JSON.stringify(pagesWithPlainText, null, 2));
        await nango.batchSave(pagesWithPlainText, 'NotionRichPage');
    }
}

const fetchAsMarkdown = async (nango: NangoSync, page: any): Promise<string> => {
    const blocks = await fetchBlocks(nango, page.id);
    const markdownBlocks = await Promise.all(blocks.map(async (block: any) => (await blockToMarkdown(nango, block)).trim()));
    return markdownBlocks.join('\n\n');
};

const fetchBlocks = async (nango: NangoSync, id: string) => {
    return paginate(nango, 'get', `/v1/blocks/${id}/children`, 'Notion blocks', 100);
};

const paginate = async (nango: NangoSync, method: 'get' | 'post', endpoint: string, desc: string, pageSize = 100, incremental = false) => {
    let cursor: string | undefined;
    let pageCounter = 0;
    let results: any[] = [];

    // eslint-disable-next-line no-constant-condition
    while (true) {
        await nango.log(`Fetching ${desc} ${pageCounter * pageSize + 1} to ${++pageCounter * pageSize}`);

        const res = await nango.proxy({
            method: method,
            endpoint: endpoint,
            headers: { 'Notion-Version': '2022-06-28' },
            data: method === 'post' ? { page_size: pageSize, start_cursor: cursor } : {},
            params: method === 'get' ? ({ page_size: `${pageSize}`, start_cursor: cursor } as any) : {},
            retries: 10 // Exponential backoff + long-running job = handles rate limits well.
        });

        if (
            incremental &&
            nango.lastSyncDate &&
            res.data.results.length &&
            new Date(res.data.results[res.data.results.length - 1].last_edited_time) < nango.lastSyncDate
        ) {
            results = results.concat(res.data.results.filter((result: any) => new Date(result.last_edited_time) >= nango.lastSyncDate!));
            break;
        } else {
            results = results.concat(res.data.results);
        }

        if (!res.data.has_more || !res.data.next_cursor) {
            break;
        } else {
            cursor = res.data.next_cursor;
        }
    }

    return results;
};

type Annotations = {
    bold: boolean;
    italic: boolean;
    strikethrough: boolean;
    underline: boolean;
    code: boolean;
    color:
        | 'default'
        | 'gray'
        | 'brown'
        | 'orange'
        | 'yellow'
        | 'green'
        | 'blue'
        | 'purple'
        | 'pink'
        | 'red'
        | 'gray_background'
        | 'brown_background'
        | 'orange_background'
        | 'yellow_background'
        | 'green_background'
        | 'blue_background'
        | 'purple_background'
        | 'pink_background'
        | 'red_background';
};

type CalloutIcon =
    | { type: 'emoji'; emoji?: string }
    | { type: 'external'; external?: { url: string } }
    | { type: 'file'; file: { url: string; expiry_time: string } }
    | null;

const annotatePlainText = (text: string, annotations: Annotations): string => {
    if (text.match(/^\s*$/)) {
        return text;
    }

    const leadingSpaceMatch = text.match(/^(\s*)/);
    const trailingSpaceMatch = text.match(/(\s*)$/);
    const leading_space = leadingSpaceMatch ? leadingSpaceMatch[0] : '';
    const trailing_space = trailingSpaceMatch ? trailingSpaceMatch[0] : '';

    text = text.trim();

    if (text !== '') {
        if (annotations.code) {
            text = inlineCode(text);
        }
        if (annotations.bold) {
            text = bold(text);
        }
        if (annotations.italic) {
            text = italic(text);
        }
        if (annotations.strikethrough) {
            text = strikethrough(text);
        }
        if (annotations.underline) {
            text = underline(text);
        }
    }

    return leading_space + text + trailing_space;
};

const blocksToMarkdown = async (nango: NangoSync, blocks: any[]) => {
    return Promise.all(blocks.map(async (block) => blockToMarkdown(nango, block)));
};

const indentParagraph = (paragraph: string) => {
    return paragraph
        .split('\n')
        .map((l) => `  ${l}`)
        .join('\n');
};

// Adaptation of https://github.com/souvikinator/notion-to-md
const blockToMarkdown = async (nango: NangoSync, block: any) => {
    if (typeof block !== 'object' || !('type' in block)) {
        return '';
    }

    let parsedData = '';
    const { type } = block;

    switch (type) {
        case 'image': {
            const blockContent = block.image;
            let image_title = 'image';

            const image_caption_plain = blockContent.caption.map((item: any) => item.plain_text).join('');

            const image_type = blockContent.type;
            let link = '';

            if (image_type === 'external') {
                link = blockContent.external.url;
            }

            if (image_type === 'file') {
                link = blockContent.file.url;
            }

            if (image_caption_plain.trim().length > 0) {
                image_title = image_caption_plain;
            } else if (image_type === 'file' || image_type === 'external') {
                const matches = link.match(/[^/\\&?]+\.\w{3,4}(?=([?&].*$|$))/);
                image_title = matches ? matches[0] : image_title;
            }

            return await image(image_title, link);
        }
        case 'divider': {
            return divider();
        }
        case 'equation': {
            return equation(block.equation.expression);
        }
        case 'video':
        case 'file':
        case 'pdf':
            {
                let blockContent;
                let title: string = type;

                if (type === 'video') blockContent = block.video;
                if (type === 'file') blockContent = block.file;
                if (type === 'pdf') blockContent = block.pdf;

                const caption = blockContent?.caption.map((item: any) => item.plain_text).join('');

                if (blockContent) {
                    const file_type = blockContent.type;
                    let _link = '';
                    if (file_type === 'external') _link = blockContent.external.url;
                    if (file_type === 'file') _link = blockContent.file.url;

                    if (caption && caption.trim().length > 0) {
                        title = caption;
                    } else if (_link) {
                        const matches = _link.match(/[^/\\&?]+\.\w{3,4}(?=([?&].*$|$))/);
                        title = matches ? matches[0] : type;
                    }

                    return link(title, _link);
                }
            }
            break;
        case 'bookmark':
        case 'embed':
        case 'link_preview':
        case 'link_to_page':
            {
                let blockContent;
                const title: string = type;
                if (type === 'bookmark') blockContent = block.bookmark;
                if (type === 'embed') blockContent = block.embed;
                if (type === 'link_preview') blockContent = block.link_preview;
                if (type === 'link_to_page' && block.link_to_page.type === 'page_id') {
                    blockContent = { url: block.link_to_page.page_id };
                }

                if (blockContent) return link(title, blockContent.url);
            }
            break;
        case 'child_page':
            return heading2(block.child_page.title);
        case 'child_database': {
            return block.child_database.title || 'child_database';
        }
        case 'table': {
            const { id, has_children } = block;
            const tableArr: string[][] = [];
            if (has_children) {
                const tableRows = await fetchBlocks(nango, id);
                const rowsPromise = tableRows?.map(async (row: any) => {
                    const { type } = row as any;
                    const cells = (row as any)[type]['cells'];
                    const cellStringPromise = cells.map(
                        async (cell: any) =>
                            await blockToMarkdown(nango, {
                                type: 'paragraph',
                                paragraph: { rich_text: cell }
                            } as any)
                    );

                    const cellStringArr = await Promise.all(cellStringPromise);
                    tableArr.push(cellStringArr);
                });
                await Promise.all(rowsPromise || []);
            }
            return table(tableArr);
        }
        case 'toggle': {
            const { id } = block;
            const childrenBlocks = await fetchBlocks(nango, id);
            const content: string = (await Promise.all(childrenBlocks.map(async (b) => blockToMarkdown(nango, b)))).join('');

            if (!block.toggle?.rich_text) {
                return content;
            }

            const summary = block.toggle.rich_text.map((b: any) => b.plain_text).join('');

            return toggle(summary, content);
        }
        default: {
            const blockContent = block[type].text || block[type].rich_text || [];
            blockContent.map((content: any) => {
                if (content.type === 'equation') {
                    parsedData += inlineEquation(content.equation.expression);
                    return;
                }

                const annotations = content.annotations;
                let plain_text = annotatePlainText(content.plain_text, annotations);
                if (content['href']) {
                    plain_text = link(plain_text, content['href']);
                }
                parsedData += plain_text;
            });
        }
    }

    switch (type) {
        case 'code':
            parsedData = codeBlock(parsedData, block[type].language);
            break;
        case 'heading_1':
            parsedData = heading1(parsedData);
            break;
        case 'heading_2':
            parsedData = heading2(parsedData);
            break;
        case 'heading_3':
            parsedData = heading3(parsedData);
            break;
        case 'quote':
            parsedData = quote(parsedData);
            break;
        case 'callout':
            {
                const { id, has_children } = block;

                if (!has_children) {
                    return callout(parsedData, block[type].icon);
                }

                const childrenBlocks = await fetchBlocks(nango, id);
                const mdBlocks = await blocksToMarkdown(nango, childrenBlocks);
                const content = `${parsedData}\n${mdBlocks.join('\n\n')}`;
                parsedData = callout(content.trim(), block[type].icon);
            }
            break;
        case 'bulleted_list_item':
            {
                const { id, has_children } = block;

                if (!has_children) {
                    return bullet(parsedData);
                }

                const childrenBlocks = await fetchBlocks(nango, id);
                const mdBlocks = await blocksToMarkdown(nango, childrenBlocks);
                const content = `${parsedData}\n${indentParagraph(mdBlocks.join('\n'))}`;
                parsedData = bullet(content.trim());
            }
            break;
        case 'numbered_list_item':
            {
                const { id, has_children } = block;

                if (!has_children) {
                    return bullet(parsedData, block.numbered_list_item.number);
                }

                const childrenBlocks = await fetchBlocks(nango, id);
                const mdBlocks = await blocksToMarkdown(nango, childrenBlocks);
                const content = `${parsedData}\n${indentParagraph(mdBlocks.join('\n'))}`;
                parsedData = bullet(content.trim(), block.numbered_list_item.number);
            }
            break;
        case 'to_do':
            {
                const { id, has_children } = block;

                if (!has_children) {
                    return todo(parsedData, block.to_do.checked);
                }

                const childrenBlocks = await fetchBlocks(nango, id);
                const mdBlocks = await blocksToMarkdown(nango, childrenBlocks);
                const content = `${parsedData}\n${indentParagraph(mdBlocks.join('\n'))}`;
                parsedData = todo(content.trim(), block.to_do.checked);
            }
            break;
    }

    return parsedData;
};

const mapPage = async (nango: NangoSync, page: any): Promise<NotionRichPage> => {
    const content = await fetchAsMarkdown(nango, page);

    const keys = Object.keys(page.properties);

    const properties = keys.reduce((acc: any, key: string) => {
        const textValue = propertyToPlainText(page.properties[key]);
        if (!textValue) {
            return acc;
        }
        return { ...acc, [key]: textValue };
    }, {});

    let title = properties.title;
    if (!title) {
        // When the page is part of a table, the title is the
        // value of the first column, and can be obtained by
        // finding the column with a 'title' type.
        for (const key of keys) {
            const property = page.properties[key];
            if (property.type === 'title') {
                title = property.title.map((t: any) => t.plain_text).join('');
                break;
            }
        }
    }

    return {
        id: page.id,
        path: page.url,
        title,
        content: content,
        contentType: 'md',
        last_modified: page.last_edited_time,
        meta: {
            created_time: page.created_time,
            last_edited_time: page.last_edited_time,
            properties
        }
    };
};

const propertyToPlainText = (property: any) => {
    try {
        switch (property.type) {
            case 'title': {
                return property.title.map((t: any) => t.plain_text).join('');
            }
            case 'rich_text': {
                return property.rich_text.map((t: any) => t.plain_text).join('');
            }
            case 'number': {
                return String(property.number);
            }
            case 'select': {
                return property.select.name;
            }
            case 'multi_select': {
                return property.multi_select.map((s: any) => s.name).join(', ');
            }
            case 'checkbox': {
                return String(property.checkbox);
            }
            case 'date': {
                return property.date.start;
            }
            case 'created_time': {
                return property.created_time;
            }
            case 'email': {
                return property.email;
            }
            case 'phone_number': {
                return property.phone_number;
            }
            case 'status': {
                return property.status.name;
            }
            case 'formula': {
                return property.formula.string;
            }
        }
    } catch {
        return undefined;
    }
};

const inlineCode = (text: string) => {
    return `\`${text}\``;
};

const inlineEquation = (text: string) => {
    return `$${text}$`;
};

const bold = (text: string) => {
    return `**${text}**`;
};

const italic = (text: string) => {
    return `_${text}_`;
};

const strikethrough = (text: string) => {
    return `~~${text}~~`;
};

const underline = (text: string) => {
    return `<u>${text}</u>`;
};

const link = (text: string, href: string) => {
    return `[${text}](${href})`;
};

const codeBlock = (text: string, language?: string) => {
    if (language === 'plain text') language = 'text';

    return `\`\`\`${language}
${text}
\`\`\``;
};

const equation = (text: string) => {
    return `$$
${text}
$$`;
};

const heading1 = (text: string) => {
    return `# ${text}`;
};

const heading2 = (text: string) => {
    return `## ${text}`;
};

const heading3 = (text: string) => {
    return `### ${text}`;
};

const quote = (text: string) => {
    return `> ${text.replace(/\n/g, '  \n> ')}`;
};

const callout = (text: string, icon?: CalloutIcon) => {
    let emoji: string | undefined;
    if (icon?.type === 'emoji') {
        emoji = icon.emoji;
    }

    return `> ${emoji ? emoji + ' ' : ''}${text.replace(/\n/g, '  \n> ')}`;
};

const bullet = (text: string, count?: number) => {
    const renderText = text.trim();
    return count ? `${count}. ${renderText}` : `- ${renderText}`;
};

const todo = (text: string, checked: boolean) => {
    return checked ? `- [x] ${text}` : `- [ ] ${text}`;
};

const image = async (alt: string, href: string): Promise<string> => {
    if (href.startsWith('data:')) {
        const base64 = href.split(',').pop();
        return `![${alt}](data:image/png;base64,${base64})`;
    }

    return `![${alt}](${href})`;
};

const divider = () => {
    return '---';
};

const toggle = (summary?: string, children?: string) => {
    if (!summary) {
        return children || '';
    }

    return `<details>
<summary>${summary}</summary>
${children || ''}
</details>\n\n`;
};

const table = (cells: string[][]) => {
    return markdownTable(cells);
};

// Source: https://github.com/wooorm/markdown-table
const markdownTable = (table: any, options: any = {}) => {
    const align = (options.align || []).concat();
    const stringLength = options.stringLength || defaultStringLength;
    const alignments = [];
    const cellMatrix = [];
    const sizeMatrix = [];
    const longestCellByColumn = [];
    let mostCellsPerRow = 0;
    let rowIndex = -1;

    while (++rowIndex < table.length) {
        const row = [];
        const sizes = [];
        let columnIndex = -1;

        if (table[rowIndex].length > mostCellsPerRow) {
            mostCellsPerRow = table[rowIndex].length;
        }

        while (++columnIndex < table[rowIndex].length) {
            const cell = serialize(table[rowIndex][columnIndex]);

            if (options.alignDelimiters !== false) {
                const size = stringLength(cell);
                sizes[columnIndex] = size;

                if (longestCellByColumn[columnIndex] === undefined || size > longestCellByColumn[columnIndex]) {
                    longestCellByColumn[columnIndex] = size;
                }
            }

            row.push(cell);
        }

        cellMatrix[rowIndex] = row;
        sizeMatrix[rowIndex] = sizes;
    }

    let columnIndex = -1;

    if (typeof align === 'object' && 'length' in align) {
        while (++columnIndex < mostCellsPerRow) {
            alignments[columnIndex] = toAlignment(align[columnIndex]);
        }
    } else {
        const code = toAlignment(align);

        while (++columnIndex < mostCellsPerRow) {
            alignments[columnIndex] = code;
        }
    }

    columnIndex = -1;
    const row = [];
    const sizes = [];

    while (++columnIndex < mostCellsPerRow) {
        const code = alignments[columnIndex];
        let before = '';
        let after = '';

        if (code === 99 /* `c` */) {
            before = ':';
            after = ':';
        } else if (code === 108 /* `l` */) {
            before = ':';
        } else if (code === 114 /* `r` */) {
            after = ':';
        }

        let size: number = options.alignDelimiters === false ? 1 : Math.max(1, longestCellByColumn[columnIndex] - before.length - after.length);

        const cell = before + '-'.repeat(size) + after;

        if (options.alignDelimiters !== false) {
            size = before.length + size + after.length;

            if (size > longestCellByColumn[columnIndex]) {
                longestCellByColumn[columnIndex] = size;
            }

            sizes[columnIndex] = size;
        }

        row[columnIndex] = cell;
    }

    cellMatrix.splice(1, 0, row);
    sizeMatrix.splice(1, 0, sizes);

    rowIndex = -1;
    const lines = [];

    while (++rowIndex < cellMatrix.length) {
        const row = cellMatrix[rowIndex];
        const sizes = sizeMatrix[rowIndex];
        columnIndex = -1;
        const line = [];

        while (++columnIndex < mostCellsPerRow) {
            const cell = row?.[columnIndex] || '';
            let before = '';
            let after = '';

            if (options.alignDelimiters !== false) {
                const size = longestCellByColumn[columnIndex] - (sizes?.[columnIndex] || 0);
                const code = alignments[columnIndex];

                if (code === 114 /* `r` */) {
                    before = ' '.repeat(size);
                } else if (code === 99 /* `c` */) {
                    if (size % 2) {
                        before = ' '.repeat(size / 2 + 0.5);
                        after = ' '.repeat(size / 2 - 0.5);
                    } else {
                        before = ' '.repeat(size / 2);
                        after = before;
                    }
                } else {
                    after = ' '.repeat(size);
                }
            }

            if (options.delimiterStart !== false && !columnIndex) {
                line.push('|');
            }

            if (options.padding !== false && !(options.alignDelimiters === false && cell === '') && (options.delimiterStart !== false || columnIndex)) {
                line.push(' ');
            }

            if (options.alignDelimiters !== false) {
                line.push(before);
            }

            line.push(cell);

            if (options.alignDelimiters !== false) {
                line.push(after);
            }

            if (options.padding !== false) {
                line.push(' ');
            }

            if (options.delimiterEnd !== false || columnIndex !== mostCellsPerRow - 1) {
                line.push('|');
            }
        }

        lines.push(options.delimiterEnd === false ? line.join('').replace(/ +$/, '') : line.join(''));
    }

    return lines.join('\n');
};

const serialize = (value: any) => {
    return value === null || value === undefined ? '' : String(value);
};

const defaultStringLength = (value: any) => {
    return value.length;
};

const toAlignment = (value: any) => {
    const code = typeof value === 'string' ? value.codePointAt(0) : 0;

    return code === 67 /* `C` */ || code === 99 /* `c` */
        ? 99 /* `c` */
        : code === 76 /* `L` */ || code === 108 /* `l` */
          ? 108 /* `l` */
          : code === 82 /* `R` */ || code === 114 /* `r` */
            ? 114 /* `r` */
            : 0;
};
