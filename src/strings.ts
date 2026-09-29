import type { TableStrings } from 'codemirror-markdown-tables';

export interface LocalizedStrings extends TableStrings {
  readonly extensionMenu: string;
  readonly insertTable: (rows: number, cols: number) => string;
  readonly copyTable: string;
  readonly deleteTable: string;
  readonly failedToCopyTable: string;
  readonly viewSource: string;
  readonly showVisualTables: string;
  readonly help: string;
}

const strings: Record<Locale, LocalizedStrings> = {
  'default': {
    extensionMenu: 'Interactive Tables',
    insertTable: (rows, cols) => `Insert ${rows}\u00d7${cols} table`,
    copyTable: 'Copy Table',
    deleteTable: 'Delete Table',
    failedToCopyTable: 'Failed to copy the table. Please try again.',
    viewSource: 'Show Table Source',
    showVisualTables: 'Show Visual Tables',
    help: 'Help…',
    tableCompletion: (rows, cols) => `${rows}\u00d7${cols} table`,
    sortColumnAscending: 'Sort by column (A-Z)',
    sortColumnDescending: 'Sort by column (Z-A)',
    alignNone: 'Align none',
    alignLeft: 'Align left',
    alignCenter: 'Align center',
    alignRight: 'Align right',
    addRowAbove: 'Add row above',
    addRowBelow: 'Add row below',
    addColumnBefore: 'Add column before',
    addColumnAfter: 'Add column after',
    moveRowUp: 'Move row up',
    moveRowDown: 'Move row down',
    moveColumnLeft: 'Move column left',
    moveColumnRight: 'Move column right',
    duplicateRow: 'Duplicate row',
    duplicateColumn: 'Duplicate column',
    clearRow: 'Clear row',
    clearColumn: 'Clear column',
    deleteRow: 'Delete row',
    deleteColumn: 'Delete column',
  },
  'zh-CN': {
    extensionMenu: '交互式表格',
    insertTable: (rows, cols) => `插入 ${rows}\u00d7${cols} 表格`,
    copyTable: '复制表格',
    deleteTable: '删除表格',
    failedToCopyTable: '复制表格失败，请重试。',
    viewSource: '显示表格源码',
    showVisualTables: '显示可视化表格',
    help: '帮助…',
    tableCompletion: (rows, cols) => `${rows}\u00d7${cols} 表格`,
    sortColumnAscending: '按列排序 (A-Z)',
    sortColumnDescending: '按列排序 (Z-A)',
    alignNone: '无对齐',
    alignLeft: '左对齐',
    alignCenter: '居中对齐',
    alignRight: '右对齐',
    addRowAbove: '在上方添加行',
    addRowBelow: '在下方添加行',
    addColumnBefore: '在前方添加列',
    addColumnAfter: '在后方添加列',
    moveRowUp: '上移行',
    moveRowDown: '下移行',
    moveColumnLeft: '左移列',
    moveColumnRight: '右移列',
    duplicateRow: '复制行',
    duplicateColumn: '复制列',
    clearRow: '清空行',
    clearColumn: '清空列',
    deleteRow: '删除行',
    deleteColumn: '删除列',
  },
  'zh-TW': {
    extensionMenu: '互動式表格',
    insertTable: (rows, cols) => `插入 ${rows}\u00d7${cols} 表格`,
    copyTable: '拷貝表格',
    deleteTable: '刪除表格',
    failedToCopyTable: '拷貝表格失敗，請再試一次。',
    viewSource: '顯示表格原始碼',
    showVisualTables: '顯示視覺化表格',
    help: '輔助說明…',
    tableCompletion: (rows, cols) => `${rows}\u00d7${cols} 表格`,
    sortColumnAscending: '按欄排序 (A-Z)',
    sortColumnDescending: '按欄排序 (Z-A)',
    alignNone: '無對齊',
    alignLeft: '靠左對齊',
    alignCenter: '置中對齊',
    alignRight: '靠右對齊',
    addRowAbove: '在上方新增列',
    addRowBelow: '在下方新增列',
    addColumnBefore: '在前方新增欄',
    addColumnAfter: '在後方新增欄',
    moveRowUp: '上移列',
    moveRowDown: '下移列',
    moveColumnLeft: '左移欄',
    moveColumnRight: '右移欄',
    duplicateRow: '複製列',
    duplicateColumn: '複製欄',
    clearRow: '清除列',
    clearColumn: '清除欄',
    deleteRow: '刪除列',
    deleteColumn: '刪除欄',
  },
};

const locales = ['default', 'zh-CN', 'zh-TW'] as const;
type Locale = typeof locales[number];

export function stringsForLocale(language: string): LocalizedStrings {
  const normalized = language.toLowerCase();
  if (normalized === 'zh-tw' || normalized.startsWith('zh-tw-')
    || normalized === 'zh-hant' || normalized.startsWith('zh-hant-')
    || normalized === 'zh-hk' || normalized.startsWith('zh-hk-')) {
    return strings['zh-TW'];
  }

  if (normalized === 'zh-cn' || normalized.startsWith('zh-cn-')
    || normalized === 'zh-hans' || normalized.startsWith('zh-hans-')
    || normalized === 'zh-sg' || normalized.startsWith('zh-sg-')) {
    return strings['zh-CN'];
  }

  return strings.default;
}

export const localizedStrings = stringsForLocale(navigator.language);
