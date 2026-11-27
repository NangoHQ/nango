// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Table, TableBody, TableCell, TableRow, TableSortButton } from './table';

import type { Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    act(() => root.unmount());
    container.remove();
});

function render(ui: React.ReactNode) {
    act(() => root.render(ui));
}

const row = () => container.querySelector<HTMLTableRowElement>('[data-slot="table-row"]')!;

describe('Table', () => {
    it('lays rows out on the given columns', () => {
        render(
            <Table columns="96px minmax(0,1fr)">
                <TableBody height={120}>
                    <TableRow offset={40}>
                        <TableCell>a</TableCell>
                        <TableCell>b</TableCell>
                    </TableRow>
                </TableBody>
            </Table>
        );
        expect(container.querySelector('table')!.style.getPropertyValue('--table-columns')).toBe('96px minmax(0,1fr)');
        expect(container.querySelector('tbody')!.style.height).toBe('120px');
        expect(row().style.transform).toBe('translateY(40px)');
    });

    it('marks selected and flashing rows only when set', () => {
        render(
            <Table>
                <TableBody>
                    <TableRow selected flash>
                        <TableCell>a</TableCell>
                    </TableRow>
                </TableBody>
            </Table>
        );
        expect(row().dataset['selected']).toBe('true');
        expect(row().dataset['flash']).toBe('true');

        render(
            <Table>
                <TableBody>
                    <TableRow>
                        <TableCell>a</TableCell>
                    </TableRow>
                </TableBody>
            </Table>
        );
        expect(row().hasAttribute('data-selected')).toBe(false);
        expect(row().hasAttribute('data-flash')).toBe(false);
    });

    it('spans every column of a table-layout row', () => {
        render(
            <Table>
                <TableBody>
                    <TableRow>
                        <TableCell fullWidth>a</TableCell>
                    </TableRow>
                </TableBody>
            </Table>
        );
        expect(container.querySelector('td')!.colSpan).toBe(1000);
    });
});

describe('TableSortButton', () => {
    it('names the current order and the one a click switches to', () => {
        render(<TableSortButton label="Timestamp" direction="asc" directionLabels={{ asc: 'oldest first', desc: 'newest first' }} />);
        expect(container.querySelector('button')!.getAttribute('aria-label')).toBe('Timestamp, oldest first. Show newest first');
    });
});
