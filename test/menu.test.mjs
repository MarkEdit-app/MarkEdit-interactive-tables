import assert from 'node:assert/strict';
import { beforeEach, mock, test } from 'node:test';
import { Annotation, EditorSelection, EditorState, Facet, StateField } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { history, undo, redo } from '@codemirror/commands';

const markdownData = Facet.define();
const host = {
  editorView: undefined,
  showAlert: mock.fn(async () => 0),
  codemirror: {
    langMarkdown: { markdownLanguage: { data: markdownData } },
    autocomplete: { autocompletion: () => [], pickedCompletion: Annotation.define() },
  },
};

let node;
let insertions;
let showVisual;

mock.module('../src/source.ts', {
  namedExports: {
    createSourceMode: callback => {
      showVisual = callback;
      return [];
    },
  },
});

mock.module('markedit-api', { namedExports: { MarkEdit: host } });
mock.module('@codemirror/language', {
  namedExports: { syntaxTree: () => ({ resolveInner: () => node }) },
});

mock.module('codemirror-markdown-tables', {
  namedExports: {
    insertEmptyMarkdownTable: ({ size }) => ({ state, dispatch }) => {
      const { from, to } = state.selection.main;
      insertions.push({ size, from, to, lineBreak: state.lineBreak });
      dispatch(state.update({
        changes: { from, to, insert: `TABLE ${size.rows}x${size.cols}` },
        selection: { anchor: from + 2 },
      }));
      return true;
    },
  },
});

const { createTableControls } = await import('../src/menu.ts');
const { createTableCreationCompletion, createTableCreationMenu } = await import('../src/creation.ts');
const { stringsForLocale } = await import('../src/strings.ts');
const renderer = StateField.define({ create: () => true, update: value => value });

beforeEach(() => {
  node = { name: 'Document', parent: null };
  insertions = [];
  host.editorView = undefined;
});

function setup({ doc = '', selection, sizes = [{ rows: 2, cols: 2 }], extensions = [] } = {}) {
  const controls = createTableControls(renderer, sizes);
  const view = {
    state: EditorState.create({
      doc, selection,
      extensions: [controls.extension, history(), ...extensions],
    }),
    composing: false,
    focus: mock.fn(),
    transactions: [],
    dispatch(spec) {
      const transaction = this.state.update(spec);
      this.transactions.push(transaction);
      this.state = transaction.state;
    },
  };

  host.editorView = view;
  const children = controls.menu.children;
  const inserts = children.slice(0, children.findIndex(item => item.separator));
  const findItem = title => {
    const item = children.find(item => item.title === title);
    assert.ok(item, `Missing menu item: ${title}`);
    return item;
  };

  const copy = findItem('Copy Table');
  const remove = findItem('Delete Table');
  const toggle = findItem('Show Table Source');
  return { controls, view, inserts, copy, remove, toggle };
}

test('menu sizes follow configuration order, with defaults when suggestions are disabled', () => {
  const custom = setup({ sizes: [{ rows: 10, cols: 3 }, { rows: 1, cols: 1 }] });
  assert.deepEqual(custom.inserts.map(item => item.title), ['Insert 10\u00d73 table', 'Insert 1\u00d71 table']);
  const defaults = setup({ sizes: [] });
  assert.deepEqual(defaults.inserts.map(item => item.title), [
    'Insert 2\u00d72 table', 'Insert 3\u00d73 table', 'Insert 4\u00d74 table',
  ]);
  assert.deepEqual(createTableCreationMenu([]), []);
});

test('insertion entries are inline and match the completion display labels', () => {
  const sizes = [{ rows: 2, cols: 3 }, { rows: 10, cols: 10 }];
  const { controls, inserts } = setup({ sizes });
  const state = EditorState.create({ doc: '|', selection: { anchor: 1 } });
  const result = createTableCreationCompletion(sizes)({ state, pos: 1 });
  assert.deepEqual(inserts.map(item => item.title), result.options.map(option => option.displayLabel));
  assert.ok(controls.menu.children.every(item => item.children === undefined));
  assert.deepEqual(controls.menu.children.slice(inserts.length).map(item => item.title ?? 'separator'),
    ['separator', 'Copy Table', 'Delete Table', 'Show Table Source', 'separator', 'Help…']);
});

function setupFocusedTable({ extensions = [], table = '| A | B |\n| :- | -: |\n| one | two |', ...options } = {}) {
  const result = setup({
    doc: `Before\n\n${table}\n\nAfter`,
    ...options,
    extensions,
  });

  const source = result.view.state.doc.toString();
  const from = source.indexOf('|');
  const to = source.lastIndexOf('|') + 1;

  result.view.dispatch({ selection: { anchor: from + 2 } });
  result.view.transactions.length = 0;
  node = { name: 'TableCell', parent: { name: 'Table', from, to, parent: null } };
  return { ...result, from, to };
}

test('copies exact table Markdown without touching document, selection, or focus', async () => {
  const { view, copy, from, to } = setupFocusedTable({
    table: '| A | B |\n| :- | -: |\n| **one** | two\\|three<br>four |',
  });

  const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  const writeText = mock.fn(async () => {});
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });

  try {
    const state = view.state;
    assert.equal(copy.state().isEnabled, true);
    await copy.action();
    assert.deepEqual(writeText.mock.calls[0].arguments, [state.sliceDoc(from, to)]);
    assert.equal(view.state, state);
    assert.equal(view.transactions.length, 0);
    assert.equal(view.focus.mock.callCount(), 0);
  } finally {
    if (original) {
      Object.defineProperty(navigator, 'clipboard', original);
    } else {
      delete navigator.clipboard;
    }
  }
});

test('copies Markdown with the document line separator in source mode', async () => {
  const table = '| A | B |\r\n| - | - |\r\n| one | two |';
  const { copy, toggle } = setupFocusedTable({
    doc: `Before\r\n\r\n${table}\r\n\r\nAfter`,
    extensions: [EditorState.lineSeparator.of('\r\n')],
  });

  toggle.action();
  const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  const writeText = mock.fn(async () => {});
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });

  try {
    await copy.action();
    assert.deepEqual(writeText.mock.calls[0].arguments, [table]);
  } finally {
    if (original) {
      Object.defineProperty(navigator, 'clipboard', original);
    } else {
      delete navigator.clipboard;
    }
  }
});

test('clipboard failures are logged and shown to the user', async () => {
  const { copy } = setupFocusedTable();
  const failure = new Error('Clipboard unavailable');
  const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async () => { throw failure; } },
  });

  const error = mock.method(console, 'error', () => {});
  host.showAlert.mock.resetCalls();

  try {
    await copy.action();
    assert.equal(error.mock.calls[0].arguments[1], failure);
    assert.deepEqual(host.showAlert.mock.calls[0].arguments, ['Failed to copy the table. Please try again.']);
  } finally {
    error.mock.restore();
    if (original) {
      Object.defineProperty(navigator, 'clipboard', original);
    } else {
      delete navigator.clipboard;
    }
  }
});

for (const sourceMode of [false, true]) {
  test(`deletes only the focused table with undo/redo in ${sourceMode ? 'source' : 'visual'} mode`, () => {
    const { view, remove, toggle, from } = setupFocusedTable();
    if (sourceMode) {
      toggle.action();
    }

    const before = view.state;
    assert.equal(remove.state().isEnabled, true);
    remove.action();

    assert.equal(view.state.doc.toString(), 'Before\n\n\n\nAfter');
    assert.equal(view.state.selection.main.head, from);
    assert.equal(view.transactions.at(-1).isUserEvent('delete'), true);
    assert.equal(view.transactions.at(-1).scrollIntoView, true);

    const target = () => ({ state: view.state, dispatch: transaction => view.dispatch(transaction) });
    assert.equal(undo(target()), true);
    assert.equal(view.state.doc.toString(), before.doc.toString());
    assert.equal(view.state.selection.eq(before.selection), true);
    assert.equal(redo(target()), true);
    assert.equal(view.state.doc.toString(), 'Before\n\n\n\nAfter');
  });
}

test('table deletion is isolated from adjacent typing in undo history', () => {
  const { view, remove, to } = setupFocusedTable();
  const original = view.state.doc.toString();
  view.dispatch({ changes: { from: to - 2, insert: '!' }, userEvent: 'input.type' });
  node.parent.to++;

  const edited = view.state.doc.toString();
  remove.action();

  const target = () => ({ state: view.state, dispatch: transaction => view.dispatch(transaction) });
  assert.equal(undo(target()), true);
  assert.equal(view.state.doc.toString(), edited);
  assert.equal(undo(target()), true);
  assert.equal(view.state.doc.toString(), original);
});

test('deletes a table that fills the document and leaves a valid caret', () => {
  const { view, remove } = setupFocusedTable({ doc: '| A |\n| - |\n| B |' });
  remove.action();
  assert.equal(view.state.doc.length, 0);
  assert.equal(view.state.selection.main.head, 0);
});

for (const extension of [EditorState.readOnly.of(true), EditorView.editable.of(false)]) {
  test('copy stays available but deletion is guarded in non-editable documents', () => {
    const { copy, remove, view } = setupFocusedTable({ extensions: [extension] });
    assert.equal(copy.state().isEnabled, true);
    assert.equal(remove.state().isEnabled, false);
    const warning = mock.method(console, 'warn', () => {});
    try {
      remove.action();
      assert.equal(view.transactions.length, 0);
      assert.equal(warning.mock.callCount(), 1);
    } finally {
      warning.mock.restore();
    }
  });
}

test('table actions require a single selection wholly within a current table', async () => {
  const { view, copy, remove, from, to } = setupFocusedTable({
    extensions: [EditorState.allowMultipleSelections.of(true)],
  });

  const warning = mock.method(console, 'warn', () => {});
  try {
    for (const selection of [
      EditorSelection.cursor(0),
      EditorSelection.range(from - 1, from + 2),
      EditorSelection.range(from + 2, to + 1),
      EditorSelection.create([EditorSelection.cursor(from + 2), EditorSelection.cursor(to - 2)]),
    ]) {
      view.dispatch({ selection });
      const state = view.state;
      assert.equal(copy.state().isEnabled, false);
      assert.equal(remove.state().isEnabled, false);
      await copy.action();
      remove.action();
      assert.equal(view.state, state);
    }

    assert.equal(warning.mock.callCount(), 8);
  } finally {
    warning.mock.restore();
  }
});

test('table actions recheck focus when invoked and are disabled during composition', async () => {
  const { copy, remove, view } = setupFocusedTable();
  assert.equal(copy.state().isEnabled, true);
  assert.equal(remove.state().isEnabled, true);
  const warning = mock.method(console, 'warn', () => {});

  try {
    for (const editor of [undefined, { ...view, composing: true }]) {
      host.editorView = editor;
      assert.equal(copy.state().isEnabled, false);
      assert.equal(remove.state().isEnabled, false);
      await copy.action();
      remove.action();
    }

    host.editorView = view;
    node = { name: 'Document', parent: null };
    assert.equal(copy.state().isEnabled, false);
    assert.equal(remove.state().isEnabled, false);
    await copy.action();
    remove.action();

    assert.equal(view.transactions.length, 0);
    assert.equal(warning.mock.callCount(), 6);
  } finally {
    warning.mock.restore();
  }
});

test('Help is the last item and opens the README Table editor section without an editor', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'open');
  const open = mock.fn();
  Object.defineProperty(globalThis, 'open', { configurable: true, value: open });

  try {
    for (const [locale, title] of [['en-US', 'Help…'], ['zh-CN', '帮助…'], ['zh-TW', '輔助說明…']]) {
      const controls = createTableControls(renderer, [], stringsForLocale(locale));
      const help = controls.menu.children.at(-1);
      assert.equal(help.title, title);
      assert.equal(help.state, undefined);
      help.action();
      assert.deepEqual(open.mock.calls.at(-1).arguments,
        ['https://github.com/MarkEdit-app/codemirror-markdown-tables#table-editor']);
    }

    assert.equal(open.mock.callCount(), 3);
  } finally {
    if (original) {
      Object.defineProperty(globalThis, 'open', original);
    } else {
      delete globalThis.open;
    }
  }
});

test('rendering toggle preserves document, selection, unrelated extensions, and undo history', () => {
  const outside = StateField.define({ create: () => 'outside', update: value => value });
  const { view, toggle } = setup({
    doc: 'original', selection: { anchor: 2 },
    extensions: [outside, createTableCreationMenu([{ rows: 2, cols: 2 }])],
  });

  view.dispatch({ changes: { from: 8, insert: '!' } });
  const selection = view.state.selection.toJSON();
  assert.equal(toggle.title, 'Show Table Source');
  assert.equal(toggle.state().isSelected, false);

  toggle.action();
  assert.equal(toggle.state().isSelected, true);
  assert.equal(view.state.field(renderer, false), undefined);
  assert.equal(view.state.field(outside), 'outside');
  assert.equal(view.state.facet(markdownData).length, 1);
  assert.equal(view.state.doc.toString(), 'original!');
  assert.deepEqual(view.state.selection.toJSON(), selection);

  toggle.action();
  assert.equal(toggle.state().isSelected, false);
  assert.equal(view.state.field(renderer), true);
  assert.equal(view.transactions.at(-1).selection !== undefined, true);
  assert.equal(view.transactions.at(-1).scrollIntoView, true);
  assert.equal(view.focus.mock.callCount(), 2);

  const target = { state: view.state, dispatch: transaction => view.dispatch(transaction) };
  assert.equal(undo(target), true);
  assert.equal(view.state.doc.toString(), 'original');
});

test('rendering state belongs to each editor rather than a global boolean', () => {
  const { controls, view, toggle } = setup();
  toggle.action();
  host.editorView = { state: EditorState.create({ extensions: controls.extension }), composing: false };
  assert.equal(toggle.state().isSelected, false);
  host.editorView = view;
  assert.equal(toggle.state().isSelected, true);
});

test('source preview action restores the clicked editor, selection, and menu state', () => {
  const { view, controls, toggle } = setup({ doc: 'original', selection: { anchor: 3 } });
  toggle.action();
  const selection = view.state.selection;
  const other = { state: EditorState.create({ extensions: controls.extension }) };
  host.editorView = other;
  showVisual(view);
  assert.equal(view.state.field(renderer), true);
  assert.equal(view.state.doc.toString(), 'original');
  assert.equal(view.state.selection.eq(selection), true);
  assert.equal(view.transactions.at(-1).selection, selection);
  assert.equal(view.focus.mock.callCount(), 2);
  host.editorView = view;
  assert.equal(toggle.state().isSelected, false);
});

test('source preview action cannot reconfigure during composition', () => {
  const { view, toggle } = setup();
  toggle.action();
  view.composing = true;
  const warning = mock.method(console, 'warn', () => {});
  try {
    showVisual(view);
    assert.equal(view.state.field(renderer, false), undefined);
    assert.equal(view.transactions.length, 1);
    assert.equal(warning.mock.callCount(), 1);
  } finally {
    warning.mock.restore();
  }
});

test('menu insertion replaces the document selection in one undoable edit', () => {
  const { view, inserts } = setup({ doc: 'Before replace After', selection: { anchor: 14, head: 7 } });
  inserts[0].action();
  assert.equal(view.state.doc.toString(), 'Before TABLE 2x2 After');
  assert.equal(view.transactions.length, 1);
  assert.equal(view.transactions[0].scrollIntoView, true);
  assert.equal(view.focus.mock.callCount(), 1);

  const target = () => ({ state: view.state, dispatch: transaction => view.dispatch(transaction) });
  assert.equal(undo(target()), true);
  assert.equal(view.state.doc.toString(), 'Before replace After');
  assert.equal(redo(target()), true);
  assert.equal(view.state.doc.toString(), 'Before TABLE 2x2 After');
});

test('insertion from a table cell goes after the containing table without replacing cell content', () => {
  const doc = 'Before\n\n| A | B |\n| - | - |\n| one | two |\n\nAfter';
  const { view, inserts } = setup({ doc, selection: { anchor: doc.indexOf('one') + 3 } });
  const tableEnd = doc.indexOf('\n\nAfter');
  node = { name: 'TableCell', parent: { name: 'Table', to: tableEnd, parent: null } };
  inserts[0].action();

  assert.equal(insertions[0].from, tableEnd);
  assert.equal(insertions[0].to, tableEnd);
  assert.equal(view.state.doc.toString(), doc.slice(0, tableEnd) + 'TABLE 2x2' + doc.slice(tableEnd));
});

test('insertion remains available in source mode and preserves the document line separator', () => {
  const { view, inserts, toggle } = setup({ extensions: [EditorState.lineSeparator.of('\r\n')] });
  toggle.action();
  inserts[0].action();

  assert.equal(insertions[0].lineBreak, '\r\n');
  assert.equal(view.state.field(renderer, false), undefined);
  assert.equal(toggle.state().isSelected, true);
});

for (const [name, options] of [
  ['read-only', { extensions: [EditorState.readOnly.of(true)] }],
  ['non-editable', { extensions: [EditorView.editable.of(false)] }],
  ['multiple selections', {
    doc: 'abc',
    selection: EditorSelection.create([EditorSelection.cursor(0), EditorSelection.cursor(2)]),
    extensions: [EditorState.allowMultipleSelections.of(true)],
  }],
]) {
  test(`insertion is disabled for ${name} documents and guarded if invoked anyway`, () => {
    const { view, inserts } = setup(options);
    const warning = mock.method(console, 'warn', () => {});
    try {
      assert.equal(inserts[0].state().isEnabled, false);
      inserts[0].action();
      assert.equal(view.transactions.length, 0);
      assert.equal(warning.mock.callCount(), 1);
    } finally {
      warning.mock.restore();
    }
  });
}

test('menus are disabled before the editor is ready and during composition', () => {
  const { view, inserts, toggle } = setup();
  for (const editor of [undefined, { ...view, composing: true }]) {
    host.editorView = editor;
    assert.equal(inserts[0].state().isEnabled, false);
    assert.equal(toggle.state().isEnabled, false);
  }
});
