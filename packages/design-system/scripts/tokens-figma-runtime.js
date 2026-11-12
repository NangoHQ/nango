/* global figma, num, hexOf, hashOf */
// Runs inside Figma through the Figma MCP `use_figma` tool; tokens-figma.mjs prepends num/hexOf/hashOf and appends the call.
/* eslint-disable no-unused-vars */

const WEIGHT_STYLES = {
    100: ['Thin'],
    200: ['ExtraLight', 'Extra Light'],
    300: ['Light'],
    400: ['Regular'],
    500: ['Medium'],
    600: ['SemiBold', 'Semi Bold'],
    700: ['Bold'],
    800: ['ExtraBold', 'Extra Bold'],
    900: ['Black']
};

async function loadFigmaState(desiredCollections) {
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    const collectionByName = new Map();
    const modeIds = new Map();
    for (const want of desiredCollections) {
        const collection = collections.find((c) => c.id === want.id) || collections.find((c) => c.name === want.name);
        if (!collection) continue;
        collectionByName.set(want.name, collection);
        for (const mode of want.modes) {
            const found = collection.modes.find((m) => m.modeId === mode.id) || collection.modes.find((m) => m.name === mode.name);
            if (found) modeIds.set(`${want.name}|${mode.name}`, found.modeId);
        }
    }
    const collectionOf = new Map([...collectionByName].map(([name, c]) => [c.id, name]));
    const variables = (await figma.variables.getLocalVariablesAsync()).filter((v) => collectionOf.has(v.variableCollectionId));
    const byKey = new Map(
        variables.flatMap((v) => [
            [v.key, v],
            [v.key.slice(0, 12), v]
        ])
    );
    const byName = new Map(variables.map((v) => [`${collectionOf.get(v.variableCollectionId)}|${v.name}`, v]));
    const byId = new Map(variables.map((v) => [v.id, v]));
    const effectStyles = await figma.getLocalEffectStylesAsync();
    const textStyles = await figma.getLocalTextStylesAsync();
    return { collectionByName, modeIds, collectionOf, variables, byKey, byName, byId, effectStyles, textStyles };
}

function canonicalFigmaVariable(state, variable, collectionName, desiredCollections) {
    const modes = desiredCollections.find((c) => c.name === collectionName).modes;
    const values = {};
    for (const mode of modes) {
        const raw = variable.valuesByMode[state.modeIds.get(`${collectionName}|${mode.name}`)];
        if (raw === undefined) continue;
        if (raw && raw.type === 'VARIABLE_ALIAS') values[mode.name] = `@${state.byId.get(raw.id) ? state.byId.get(raw.id).name : raw.id}`;
        else if (variable.resolvedType === 'COLOR') values[mode.name] = hexOf(raw);
        else if (variable.resolvedType === 'STRING') values[mode.name] = raw;
        else if (variable.resolvedType === 'EASING') {
            const b = raw.easingFunctionCubicBezier || {};
            values[mode.name] = [b.x1, b.y1, b.x2, b.y2].map(num).join(',');
        } else values[mode.name] = num(raw);
    }
    return { n: variable.name, t: variable.resolvedType, v: values };
}

function plainDescription(text) {
    const entities = { '&#39;': "'", '&quot;': '"', '&lt;': '<', '&gt;': '>', '&amp;': '&' };
    return (text || '').replace(/&#39;|&quot;|&lt;|&gt;|&amp;/g, (m) => entities[m]);
}

function canonicalFigmaStyle(state, kind, style) {
    const aliasName = (binding) => (binding && state.byId.get(binding.id) ? state.byId.get(binding.id).name : '');
    if (kind === 'effect') {
        return {
            n: style.name,
            e: style.effects.map((e) => [
                e.type,
                num(e.offset ? e.offset.x : 0),
                num(e.offset ? e.offset.y : 0),
                num(e.radius || 0),
                num(e.spread || 0),
                e.color ? hexOf(e.color) : '',
                aliasName(e.boundVariables && e.boundVariables.color)
            ])
        };
    }
    const weight = Number(Object.keys(WEIGHT_STYLES).find((w) => WEIGHT_STYLES[w].includes(style.fontName.style)) || 0);
    const bound = style.boundVariables || {};
    return {
        n: style.name,
        f: style.fontName.family,
        w: weight,
        s: num(style.fontSize),
        lh: style.lineHeight.unit === 'PERCENT' ? num(style.lineHeight.value) : `${style.lineHeight.unit}`,
        ls: style.letterSpacing.unit === 'PIXELS' ? num(style.letterSpacing.value) : `${style.letterSpacing.unit}`,
        b: [aliasName(bound.fontFamily), aliasName(bound.fontWeight), aliasName(bound.fontSize), aliasName(bound.letterSpacing)]
    };
}

function findStyle(state, kind, name, id) {
    const list = kind === 'effect' ? state.effectStyles : state.textStyles;
    return list.find((s) => s.id === id) || list.find((s) => s.name === name);
}

async function checkTokens(input) {
    const state = await loadFigmaState(input.collections);
    const changed = [];
    const errors = [];
    for (const collection of input.collections) {
        if (!state.collectionByName.has(collection.name)) errors.push(`collection ${collection.name} is missing; create it by hand first`);
    }
    const descriptions = [];
    const compare = (kind, name, node, current, hash, descriptionHash) => {
        const valueChanged = hashOf(current) !== hash;
        if (valueChanged) changed.push({ kind, name, current });
        const description = plainDescription(node.description);
        if (hashOf(description) !== descriptionHash) {
            if (!valueChanged) changed.push({ kind, name, current: 'description' });
            descriptions.push({ kind, name, text: description });
        }
    };
    const seenVariables = new Set();
    for (const [collectionName, name, key, hash, descriptionHash] of input.variables) {
        const variable = (key && state.byKey.get(key)) || state.byName.get(`${collectionName}|${name}`);
        if (!variable) {
            changed.push({ kind: 'variable', name, current: null });
            continue;
        }
        seenVariables.add(variable.id);
        compare('variable', name, variable, canonicalFigmaVariable(state, variable, collectionName, input.collections), hash, descriptionHash);
    }
    const seenStyles = new Set();
    for (const [kind, name, id, hash, descriptionHash] of input.styles) {
        const style = findStyle(state, kind, name, id);
        if (!style) {
            changed.push({ kind, name, current: null });
            continue;
        }
        seenStyles.add(style.id);
        compare(kind, name, style, canonicalFigmaStyle(state, kind, style), hash, descriptionHash);
    }
    const orphans = [
        ...state.variables
            .filter((v) => !seenVariables.has(v.id))
            .map((v) => ({ kind: 'variable', name: `${state.collectionOf.get(v.variableCollectionId)}/${v.name}` })),
        ...[...state.effectStyles, ...state.textStyles].filter((s) => !seenStyles.has(s.id)).map((s) => ({ kind: 'style', name: s.name }))
    ];
    return { changed, descriptions, orphans, errors };
}

async function applyTokens(input) {
    const state = await loadFigmaState(input.collections);
    const errors = [];
    const created = { variables: [], styles: [] };
    const findVariable = (name) => state.byName.get(`Colors|${name}`) || state.byName.get(`Primitives|${name}`);
    const hexToColor = (hex) => {
        const n = (i) => parseInt(hex.slice(i, i + 2), 16) / 255;
        return { r: n(1), g: n(3), b: n(5), a: hex.length > 7 ? n(7) : 1 };
    };

    const pending = [];
    for (const want of input.variables) {
        const collection = state.collectionByName.get(want.collection);
        let variable = (want.key && state.byKey.get(want.key)) || state.byName.get(`${want.collection}|${want.name}`);
        if (!variable) {
            variable = figma.variables.createVariable(want.name, collection, want.type);
            variable.scopes = ['ALL_SCOPES'];
            state.byName.set(`${want.collection}|${want.name}`, variable);
            created.variables.push({ collection: want.collection, name: want.name, key: variable.key });
        } else if (variable.resolvedType !== want.type) {
            errors.push(`${want.name}: Figma type ${variable.resolvedType}, token type ${want.type}. Change it by hand.`);
            continue;
        }
        variable.name = want.name;
        variable.description = want.description;
        pending.push([variable, want]);
    }
    for (const [variable, want] of pending) {
        for (const [modeName, value] of Object.entries(want.valuesByMode)) {
            const modeId = state.modeIds.get(`${want.collection}|${modeName}`);
            if (value.alias) {
                const target = findVariable(value.alias);
                if (!target) {
                    errors.push(`${want.name} (${modeName}): alias target ${value.alias} doesn't exist yet; run the check again`);
                    continue;
                }
                variable.setValueForMode(modeId, figma.variables.createVariableAlias(target));
            } else {
                variable.setValueForMode(modeId, want.type === 'COLOR' ? hexToColor(value.value) : value.value);
            }
        }
    }

    const fonts = input.styles.some((s) => s.kind === 'text') ? await figma.listAvailableFontsAsync() : [];
    for (const want of input.styles) {
        let style = findStyle(state, want.kind, want.name, want.id);
        if (want.kind === 'effect') {
            if (!style) {
                style = figma.createEffectStyle();
                created.styles.push({ theme: want.theme, path: want.path, id: style.id });
            }
            style.name = want.name;
            style.description = want.description;
            style.effects = want.effects.map((e) => {
                const effect = {
                    type: e.type,
                    color: e.color,
                    offset: { x: e.x, y: e.y },
                    radius: e.blur,
                    spread: e.spread,
                    visible: true,
                    blendMode: 'NORMAL',
                    showShadowBehindNode: false
                };
                const target = e.colorAlias && findVariable(e.colorAlias);
                return target ? figma.variables.setBoundVariableForEffect(effect, 'color', target) : effect;
            });
            continue;
        }
        const familyStyles = fonts.filter((f) => f.fontName.family === want.fontFamily.value).map((f) => f.fontName.style);
        const fontStyle = (WEIGHT_STYLES[want.fontWeight.value] || []).find((s) => familyStyles.includes(s));
        if (!fontStyle) {
            errors.push(`${want.name}: no ${want.fontFamily.value} font at weight ${want.fontWeight.value}`);
            continue;
        }
        if (!style) {
            style = figma.createTextStyle();
            created.styles.push({ theme: want.theme, path: want.path, id: style.id });
        }
        await figma.loadFontAsync({ family: want.fontFamily.value, style: fontStyle });
        style.name = want.name;
        style.description = want.description;
        style.fontName = { family: want.fontFamily.value, style: fontStyle };
        style.fontSize = want.fontSize.value;
        style.lineHeight = { unit: 'PERCENT', value: want.lineHeightPercent };
        style.letterSpacing = { unit: 'PIXELS', value: want.letterSpacing.value };
        for (const [field, binding] of [
            ['fontFamily', want.fontFamily],
            ['fontWeight', want.fontWeight],
            ['fontSize', want.fontSize],
            ['letterSpacing', want.letterSpacing]
        ]) {
            style.setBoundVariable(field, (binding.alias && findVariable(binding.alias)) || null);
        }
    }
    return { created, errors };
}
