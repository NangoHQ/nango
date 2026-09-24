import path from 'node:path';

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
