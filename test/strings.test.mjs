import assert from 'node:assert/strict';
import test from 'node:test';

const { stringsForLocale } = await import('../src/strings.ts');

test('uses English strings for unsupported locales', () => {
  const strings = stringsForLocale('en-US');
  assert.equal(strings.extensionMenu, 'Interactive Tables');
  assert.equal(strings.insertTable(2, 3), 'Insert 2\u00d73 table');
  assert.equal(strings.addRowAbove, 'Add row above');
  assert.equal(strings.showVisualTables, 'Show Visual Tables');
  assert.equal(strings.viewSource, 'Show Table Source');
  assert.equal(strings.help, 'Help…');
  assert.equal(strings.copyTable, 'Copy Table');
  assert.equal(strings.deleteTable, 'Delete Table');
});

test('localizes extension and library strings in Simplified Chinese', () => {
  const strings = stringsForLocale('zh-Hans-CN');
  assert.equal(strings.extensionMenu, '交互式表格');
  assert.equal(strings.insertTable(2, 3), '插入 2\u00d73 表格');
  assert.equal(strings.addRowAbove, '在上方添加行');
  assert.equal(strings.showVisualTables, '显示可视化表格');
  assert.equal(strings.viewSource, '显示表格源码');
  assert.equal(strings.help, '帮助…');
  assert.equal(strings.copyTable, '复制表格');
  assert.equal(strings.deleteTable, '删除表格');
});

test('localizes extension and library strings in Traditional Chinese', () => {
  const strings = stringsForLocale('zh-Hant-TW');
  assert.equal(strings.extensionMenu, '互動式表格');
  assert.equal(strings.insertTable(2, 3), '插入 2\u00d73 表格');
  assert.equal(strings.addColumnBefore, '在前方新增欄');
  assert.equal(strings.showVisualTables, '顯示視覺化表格');
  assert.equal(strings.viewSource, '顯示表格原始碼');
  assert.equal(strings.help, '輔助說明…');
  assert.equal(strings.copyTable, '拷貝表格');
  assert.equal(strings.deleteTable, '刪除表格');
});
