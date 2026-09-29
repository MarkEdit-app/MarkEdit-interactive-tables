import type { MarkdownTablesConfig, TableStyleProps } from 'codemirror-markdown-tables';

export interface TableSize {
  rows: number;
  cols: number;
}

export const defaultTableSizes: readonly TableSize[] = [2, 3, 4].map(size => ({ rows: size, cols: size }));

type Settings = Required<Pick<MarkdownTablesConfig, 'selectionType' | 'handlePosition' | 'lineWrapping'>> & {
  tableCreationMenu: readonly TableSize[];
  style: {
    fontFamily: string;
    fontSize: string;
    defaultHeaderAlignment: NonNullable<TableStyleProps['--tbl-style-default-header-alignment']>;
  };
};

export function readSettings(userSettings: unknown): Settings {
  const defaults: Settings = {
    tableCreationMenu: defaultTableSizes,
    selectionType: 'codemirror',
    handlePosition: 'outside',
    lineWrapping: 'wrap',
    style: readStyle(undefined),
  };

  if (userSettings === undefined || userSettings === null) {
    return defaults;
  }

  if (typeof userSettings !== 'object' || Array.isArray(userSettings)) {
    console.warn('MarkEdit-interactive-tables: expected an object for user settings.');
    return defaults;
  }

  if (!('extension.markeditInteractiveTables' in userSettings)) {
    return defaults;
  }

  const settings = userSettings['extension.markeditInteractiveTables'];
  if (typeof settings !== 'object' || settings === null || Array.isArray(settings)) {
    console.warn('MarkEdit-interactive-tables: extension.markeditInteractiveTables must be an object.');
    return defaults;
  }

  let tableCreationMenu = defaults.tableCreationMenu;
  if ('tableCreationMenu' in settings) {
    const sizes = Array.isArray(settings.tableCreationMenu)
      ? settings.tableCreationMenu.map(parseTableSize) : null;
    if (sizes === null || !sizes.every(size => size !== null)) {
      console.warn('MarkEdit-interactive-tables: tableCreationMenu must be an array of positive integer sizes such as "2x2" or "10x10". Using defaults.');
    } else {
      tableCreationMenu = sizes;
    }
  }

  return {
    tableCreationMenu,
    selectionType: readChoice('selectionType',
      'selectionType' in settings ? settings.selectionType : undefined, ['codemirror', 'native']),
    handlePosition: readChoice('handlePosition',
      'handlePosition' in settings ? settings.handlePosition : undefined, ['outside', 'inside']),
    lineWrapping: readChoice('lineWrapping',
      'lineWrapping' in settings ? settings.lineWrapping : undefined, ['wrap', 'nowrap']),
    style: readStyle('style' in settings ? settings.style : undefined),
  };
}

function readStyle(value: unknown): Settings['style'] {
  const defaults: Settings['style'] = {
    fontFamily: 'system-ui',
    fontSize: 'inherit',
    defaultHeaderAlignment: 'left',
  };

  if (value === undefined) {
    return defaults;
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    console.warn('MarkEdit-interactive-tables: style must be an object. Using default styles.');
    return defaults;
  }

  return {
    fontFamily: readFont('fontFamily', 'fontFamily' in value ? value.fontFamily : undefined, defaults.fontFamily),
    fontSize: readFont('fontSize', 'fontSize' in value ? value.fontSize : undefined, defaults.fontSize),
    defaultHeaderAlignment: readChoice('style.defaultHeaderAlignment',
      'defaultHeaderAlignment' in value ? value.defaultHeaderAlignment : undefined, ['left', 'center', 'right']),
  };
}

function readFont(name: 'fontFamily' | 'fontSize', value: unknown, fallback: string): string {
  if (value === undefined) {
    return fallback;
  }

  const property = name === 'fontFamily' ? 'font-family' : 'font-size';
  if (typeof value === 'string' && CSS.supports(property, value)) {
    return value;
  }

  console.warn(`MarkEdit-interactive-tables: style.${name} must be a valid CSS ${property} string. Using ${fallback}.`);
  return fallback;
}

function readChoice<T extends string>(name: string, value: unknown, choices: readonly [T, ...T[]]): T {
  if (value === undefined) {
    return choices[0];
  }

  const choice = choices.find(choice => choice === value);
  if (choice !== undefined) {
    return choice;
  }

  console.warn(`MarkEdit-interactive-tables: ${name} must be one of ${choices.join(', ')}. Using ${choices[0]}.`);
  return choices[0];
}

function parseTableSize(value: unknown): TableSize | null {
  const match = typeof value === 'string' ? /^([1-9]\d*)x([1-9]\d*)$/.exec(value) : null;
  if (match === null) {
    return null;
  }

  const rows = Number(match[1]);
  const cols = Number(match[2]);
  return Number.isSafeInteger(rows) && Number.isSafeInteger(cols) ? { rows, cols } : null;
}
