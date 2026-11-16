import path from 'node:path';

import { Err, Ok } from '../utils/result.js';

import type { ParsedEntryPoint } from './definitions.js';
import type { Result } from '@nangohq/types';

export interface ResolvedProjectPath {
    absolute: string;
    relative: string;
}

export function normalizeProjectRelativePath(filePath: string): string | null {
    const normalizedPath = path.posix.normalize(filePath.replaceAll('\\', '/'));
    if (path.posix.isAbsolute(normalizedPath) || normalizedPath === '..' || normalizedPath.startsWith('../')) {
        return null;
    }

    return `./${normalizedPath.replace(/^\.\//, '')}`;
}

export function resolveProjectPath({ projectRoot, filePath }: { projectRoot: string; filePath: string }): ResolvedProjectPath | null {
    const relative = normalizeProjectRelativePath(filePath);
    if (!relative) {
        return null;
    }

    const absoluteProjectRoot = path.resolve(projectRoot);
    const absolute = path.resolve(absoluteProjectRoot, relative);
    const relativeToProjectRoot = path.relative(absoluteProjectRoot, absolute);
    if (relativeToProjectRoot === '..' || relativeToProjectRoot.startsWith(`..${path.sep}`) || path.isAbsolute(relativeToProjectRoot)) {
        return null;
    }

    return { absolute, relative };
}

export function isPath(value: string): boolean {
    return /\.[jt]s$/.test(value) || /[/\\]/.test(value);
}

export function resolveEntryPoint({
    fullPath,
    file,
    entryPoints
}: {
    fullPath: string;
    file: string;
    entryPoints: ParsedEntryPoint[];
}): Result<ParsedEntryPoint> {
    const tsFile = file.replace(/\.js$/, '.ts');
    const resolved = resolveProjectPath({ projectRoot: fullPath, filePath: path.isAbsolute(tsFile) ? path.relative(fullPath, tsFile) : tsFile });
    if (!resolved) {
        return Err(new Error(`'${file}' must be inside the project folder.`));
    }

    const entryPoint = entryPoints.find((candidate) => normalizeProjectRelativePath(candidate.filePath) === resolved.relative);
    if (!entryPoint) {
        return Err(new Error(`'${file}' is not a script. Make sure it is imported from index.ts.`));
    }

    return Ok(entryPoint);
}
