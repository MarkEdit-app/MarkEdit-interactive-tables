import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { EditorState } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { selectAll } from '@codemirror/commands';

const markdownTables = mock.fn(() => []);
const addExtension = mock.fn();
const addMainMenuItem = mock.fn();

mock.module('codemirror-markdown-tables', {
  namedExports: {
    markdownTables,
    TableStyle: { default: { with: () => ({}) } },
    TableTheme: {
      githubLight: { props: {}, with: props => ({ props }) },
      githubDark: { props: {}, with: props => ({ props }) },
    },
  },
});

mock.module('markedit-api', {
  namedExports: {
    MarkEdit: { userSettings: {}, addExtension, addMainMenuItem, onEditorReady() {} },
  },
});

mock.module('../src/creation.ts', {
  namedExports: { createTableCreationMenu: () => [], insertTable() {} },
});

await import('../main.ts');
const { adaptiveTableTheme, syncTableColors } = await import('../src/theme.ts');

test('registers adaptive palettes together with live color synchronization', () => {
  const config = markdownTables.mock.calls[0].arguments[0];
  assert.equal(config.theme, adaptiveTableTheme);
  assert.equal(config.strings.addRowAbove, 'Add row above');
  assert.ok(addExtension.mock.calls[0].arguments[0].includes(syncTableColors));
});

test('registers table insertion and rendering controls in the main menu', () => {
  assert.equal(addMainMenuItem.mock.callCount(), 1);
  const menu = addMainMenuItem.mock.calls[0].arguments[0];
  assert.equal(menu.title, 'Interactive Tables');
  assert.deepEqual(menu.children.filter(item => !item.separator).map(item => item.title),
    ['Insert 2\u00d72 table', 'Insert 3\u00d73 table', 'Insert 4\u00d74 table',
      'Copy Table', 'Delete Table', 'Show Table Source', 'Help…']);
});

test('registers Select All inside table cells, not on the root editor', () => {
  const config = markdownTables.mock.calls[0].arguments[0];
  const cell = EditorState.create({ doc: 'Table cell', extensions: config.extensions });
  const bindings = cell.facet(keymap).flat();
  assert.deepEqual(bindings, [{ key: 'Mod-a', run: selectAll }]);
  assert.equal(config.globalKeyBindings, undefined);

  const root = EditorState.create({ extensions: addExtension.mock.calls[0].arguments[0] });
  assert.deepEqual(root.facet(keymap), []);
});

test('cell Select All covers the complete cell and handles empty cells', () => {
  const config = markdownTables.mock.calls[0].arguments[0];
  for (const doc of ['Table cell', '']) {
    let state = EditorState.create({ doc, extensions: config.extensions });
    const binding = state.facet(keymap).flat()[0];
    assert.equal(binding.run({
      state,
      dispatch: spec => { state = state.update(spec).state; },
    }), true);

    assert.equal(state.selection.main.from, 0);
    assert.equal(state.selection.main.to, doc.length);
  }
});
