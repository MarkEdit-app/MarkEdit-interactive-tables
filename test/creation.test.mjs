import assert from 'node:assert/strict';
import { beforeEach, mock, test } from 'node:test';
import { Annotation, EditorSelection, EditorState, Facet, StateField } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { history, redo, undo } from '@codemirror/commands';

const markdownData = Facet.define();
const autocompleteConfig = Facet.define();
const pickedCompletion = Annotation.define();

let syntaxNames;
let insertions;
let insertionError;
let nativeMenuCalls;

mock.module('markedit-api', {
  namedExports: {
    MarkEdit: {
      codemirror: {
        langMarkdown: { markdownLanguage: { data: markdownData } },
        autocomplete: {
          autocompletion: config => autocompleteConfig.of(config),
          pickedCompletion,
        },
      },
      showContextMenu() { nativeMenuCalls++; },
    },
  },
});

mock.module('@codemirror/language', {
  namedExports: {
    syntaxTree: () => ({
      resolveInner: () => syntaxNames.reduceRight((parent, name) => ({ name, parent }), null),
    }),
  },
});

mock.module('codemirror-markdown-tables', {
  namedExports: {
    insertEmptyMarkdownTable: ({ size }) => ({ state, dispatch }) => {
      if (insertionError) {
        throw insertionError;
      }

      const { from, to } = state.selection.main;
      insertions.push({ size, from, to });
      dispatch(state.update({
        changes: { from, to, insert: `TABLE ${size.rows}x${size.cols}` },
        selection: { anchor: from + 2 },
      }));

      return true;
    },
  },
});

const { createTableCreationCompletion, createTableCreationMenu } = await import('../src/creation.ts');
const { readSettings } = await import('../src/settings.ts');
const { stringsForLocale } = await import('../src/strings.ts');

const defaults = [{ rows: 2, cols: 2 }, { rows: 3, cols: 3 }, { rows: 4, cols: 4 }];
const defaultSettings = {
  tableCreationMenu: defaults,
  selectionType: 'codemirror',
  handlePosition: 'outside',
  lineWrapping: 'wrap',
  style: {
    fontFamily: 'system-ui',
    fontSize: 'inherit',
    defaultHeaderAlignment: 'left',
  },
};

const complete = createTableCreationCompletion(defaults);

beforeEach(() => {
  syntaxNames = ['Document'];
  insertions = [];
  insertionError = undefined;
  nativeMenuCalls = 0;
});

function context({ doc = '|', pos = doc.length, extensions = [], selection } = {}) {
  return {
    state: EditorState.create({
      doc,
      selection: selection ?? { anchor: pos },
      extensions,
    }),
    pos,
    explicit: false,
  };
}

function editorView(state) {
  const transactions = [];
  return {
    state,
    transactions,
    dispatch(spec) {
      const transaction = this.state.update(spec);
      transactions.push(transaction);
      this.state = transaction.state;
    },
  };
}

test('adds the configured table source alongside existing Markdown link completions', async () => {
  const linkSource = () => null;
  const sizes = [{ rows: 10, cols: 10 }];
  const state = EditorState.create({
    extensions: [markdownData.of({ autocomplete: linkSource }), createTableCreationMenu(sizes)],
  });

  const sources = state.facet(markdownData).map(value => value.autocomplete);
  assert.equal(sources[0], linkSource);
  assert.equal(sources.length, 2);
  assert.deepEqual((await sources[1](context())).options.map(option => option.label), ['Insert 10x10 table']);
});

test('only customizes row classes, leaving host completion behavior unchanged', () => {
  const state = EditorState.create({ extensions: createTableCreationMenu(defaults) });
  assert.deepEqual(Object.keys(state.facet(autocompleteConfig)[0]), ['optionClass']);
});

for (const [name, option, expected] of [
  ['table suggestions', { type: 'table' }, 'tbl-table-completion'],
  ['link suggestions', { type: 'text' }, ''],
  ['untyped suggestions', {}, ''],
]) {
  test(`marks ${name} independently of current completion results`, () => {
    const state = EditorState.create({ extensions: createTableCreationMenu(defaults) });
    assert.equal(state.facet(autocompleteConfig)[0].optionClass(option), expected);
  });
}

test('uses searchable Insert labels and preserves the visible multiplication sign', async () => {
  const result = await complete(context());
  assert.equal(result.from, 1);
  assert.equal(result.to, 1);
  assert.deepEqual(result.options.map(option => option.label), [
    'Insert 2x2 table', 'Insert 3x3 table', 'Insert 4x4 table',
  ]);
  assert.deepEqual(result.options.map(option => option.displayLabel), [
    'Insert 2\u00d72 table', 'Insert 3\u00d73 table', 'Insert 4\u00d74 table',
  ]);
  assert.ok(result.options.every(option => option.type === 'table'));
  assert.equal(nativeMenuCalls, 0);
});

for (const text of ['', '2', '2x2', '2\u00d72', 'Insert', 'Insert 2', 'Insert 2x2 table']) {
  test(`updates completion results immediately for filter text ${JSON.stringify(text)}`, async () => {
    const initial = await complete(context());
    const result = initial.update(initial, 1, text.length + 1, context({ doc: `|${text}` }));
    assert.equal(result.from, 1);
    assert.equal(result.to, text.length + 1);
    assert.equal(result.filter, false);
    assert.equal(result.options.length, text === '' || text === 'Insert' ? 3 : 1);
    assert.equal(result.options[0].label, 'Insert 2x2 table');
  });
}

test('stops reusing suggestions for table syntax and new lines', async () => {
  const result = await complete(context());
  for (const text of [' cell |', '\n', '-', '\\', '2|']) {
    assert.equal(result.update(result, 1, text.length + 1, context({ doc: `|${text}` })), null);
  }
});

test('a space immediately after the pipe dismisses suggestions without changing text', async () => {
  const initial = await complete(context());
  for (const doc of ['| ', '|  ', '| 2', '| Insert 2', '| table']) {
    const input = context({ doc });
    assert.equal(initial.update(initial, 1, doc.length, input), null);
    assert.equal(await complete({ ...input, explicit: true }), null);
    assert.equal(input.state.doc.toString(), doc);
  }
});

test('unmatched text has no results without changing the document', async () => {
  const input = context({ doc: '|notatable' });
  assert.deepEqual((await complete(input)).options, []);
  assert.equal(input.state.doc.toString(), '|notatable');
});

test('matches sizes and labels case-insensitively with correct highlighted ranges', async () => {
  for (const [text, match] of [['2X2', [7, 10]], ['insert 2', [0, 8]]]) {
    const result = await complete(context({ doc: `|${text}` }));
    assert.equal(result.options.length, 1);
    assert.deepEqual(result.getMatch(result.options[0]), match);
  }
});

for (const [text, count, match] of [
  ['t', 3, [5, 6]],
  ['ta', 3, [11, 13]],
  ['tab', 3, [11, 14]],
  ['tabl', 3, [11, 15]],
  ['table', 3, [11, 16]],
  ['TABLE', 3, [11, 16]],
  ['ble', 3, [13, 16]],
  ['x2', 1, [8, 10]],
  ['\u00d72', 1, [8, 10]],
  ['rT 2', 1, [4, 8]],
]) {
  test(`matches substring ${JSON.stringify(text)} and highlights its actual position`, async () => {
    const initial = await complete(context());
    const result = initial.update(initial, 1, text.length + 1, context({ doc: `|${text}` }));
    assert.equal(result.options.length, count);
    assert.deepEqual(result.options.map(option => option.label), [
      'Insert 2x2 table', 'Insert 3x3 table', 'Insert 4x4 table',
    ].slice(0, count));

    for (const option of result.options) {
      assert.deepEqual(result.getMatch(option), match);
    }
  });
}

test('accepting a substring match replaces the entire pipe and filter text', async () => {
  const input = context({ doc: '|table' });
  const result = await complete(input);
  const view = editorView(input.state);
  result.options[1].apply(view, result.options[1], result.from, result.to);
  assert.equal(view.state.doc.toString(), 'TABLE 3x3');
  assert.equal(view.transactions.length, 1);
});

for (const size of [2, 3, 4, 10]) {
  test(`replaces the pipe and filter with the configured ${size}x${size} table in one edit`, async () => {
    const input = context({ doc: `Before\n|Insert ${size}\nAfter`, pos: `Before\n|Insert ${size}`.length });
    const source = createTableCreationCompletion([{ rows: size, cols: size }]);
    const result = await source(input);
    const view = editorView(input.state);
    const option = result.options[0];
    option.apply(view, option, result.from, result.to);

    assert.equal(view.state.doc.toString(), `Before\nTABLE ${size}x${size}\nAfter`);
    assert.equal(view.state.selection.main.head, 9);
    assert.equal(view.transactions.length, 1);
    assert.equal(view.transactions[0].annotation(pickedCompletion), option);
    assert.ok(view.transactions[0].isUserEvent('input.complete'));
    assert.deepEqual(insertions, [{ size: { rows: size, cols: size }, from: 7, to: input.pos }]);
    assert.equal(nativeMenuCalls, 0);
  });
}

test('cached options use the current mapped range and document when accepted', async () => {
  const result = await complete(context());
  const input = context({ doc: 'Before\n|2x2\nAfter', pos: 11 });
  const view = editorView(input.state);
  result.options[0].apply(view, result.options[0], 8, 11);
  assert.equal(view.state.doc.toString(), 'Before\nTABLE 2x2\nAfter');
});

test('insertion is undone and redone as a single edit', async () => {
  const input = context({ doc: '|2', extensions: [history()] });
  const result = await complete(input);
  const view = editorView(input.state);
  result.options[0].apply(view, result.options[0], result.from, result.to);

  const commandTarget = () => ({ state: view.state, dispatch: transaction => view.dispatch(transaction) });
  assert.equal(undo(commandTarget()), true);
  assert.equal(view.state.doc.toString(), '|2');
  assert.equal(view.state.selection.main.head, 2);
  assert.equal(redo(commandTarget()), true);
  assert.equal(view.state.doc.toString(), 'TABLE 2x2');
});

test('insertion runs host filters and state updates only for the dispatched transaction', async () => {
  let updates = 0;
  let filters = 0;
  const input = context({
    extensions: [
      StateField.define({
        create: () => 0,
        update: value => { updates++; return value; },
      }),
      EditorState.transactionFilter.of(transaction => { filters++; return transaction; }),
    ],
  });
  const result = await complete(input);
  const view = editorView(input.state);
  result.options[0].apply(view, result.options[0], result.from, result.to);
  assert.equal(updates, 1);
  assert.equal(filters, 1);
  assert.equal(view.transactions[0].scrollIntoView, true);
});

test('propagates insertion failures instead of reporting success', async () => {
  const input = context();
  const result = await complete(input);
  insertionError = new Error('Insertion failed');
  assert.throws(() => result.options[0].apply(editorView(input.state), result.options[0], 1, 1), /Insertion failed/);
});

for (const doc of ['', 'text|', ' |', '\\|', '| cell |', '    |', '||']) {
  test(`does not offer tables for ${JSON.stringify(doc)}`, async () => {
    assert.equal(await complete(context({ doc })), null);
  });
}

for (const name of ['FencedCode', 'CodeBlock', 'InlineCode']) {
  test(`does not offer tables inside ${name}`, async () => {
    syntaxNames = ['CodeText', name, 'Document'];
    assert.equal(await complete(context()), null);
  });
}

for (const [name, extensions] of [
  ['read-only', [EditorState.readOnly.of(true)]],
  ['non-editable', [EditorView.editable.of(false)]],
]) {
  test(`does not offer tables in a ${name} editor`, async () => {
    assert.equal(await complete(context({ extensions })), null);
  });
}

test('does not offer tables during composition', async () => {
  assert.equal(await complete({ ...context(), view: { composing: true } }), null);
});

test('does not offer tables for selections or multiple cursors', async () => {
  assert.equal(await complete(context({ selection: { anchor: 0, head: 1 } })), null);
  assert.equal(await complete(context({
    extensions: [EditorState.allowMultipleSelections.of(true)],
    selection: EditorSelection.create([EditorSelection.cursor(0), EditorSelection.cursor(1)]),
  })), null);
});

test('does not offer tables away from the cursor or in the middle of a line', async () => {
  assert.equal(await complete(context({ selection: { anchor: 0 } })), null);
  assert.equal(await complete(context({ doc: '|2x2', pos: 2 })), null);
});

test('supports explicit completion through the host', async () => {
  assert.ok(await complete({ ...context({ doc: '|2' }), explicit: true }));
});

test('defaults to 2x2, 3x3, and 4x4', () => {
  for (const settings of [undefined, null, {}, { 'extension.markeditInteractiveTables': {} }]) {
    assert.deepEqual(readSettings(settings), defaultSettings);
  }
});

test('settings do not read the separate Table Editor extension key', () => {
  const otherSettings = { tableCreationMenu: [], selectionType: 'native' };
  assert.deepEqual(readSettings({
    'extension.markeditTableEditor': otherSettings,
  }), defaultSettings);
  assert.deepEqual(readSettings({
    'extension.markeditTableEditor': otherSettings,
    'extension.markeditInteractiveTables': { lineWrapping: 'nowrap' },
  }), { ...defaultSettings, lineWrapping: 'nowrap' });
});

test('core settings work without specifying tableCreationMenu', () => {
  const overrides = { selectionType: 'native', handlePosition: 'inside', lineWrapping: 'nowrap' };
  assert.deepEqual(readSettings({
    'extension.markeditInteractiveTables': overrides,
  }), { ...defaultSettings, ...overrides });
});

test('invalid core settings fall back independently without losing valid settings', () => {
  const overrides = {
    tableCreationMenu: ['10x10'],
    selectionType: 'native',
    handlePosition: 'inside',
    lineWrapping: 'nowrap',
  };

  const warning = mock.method(console, 'warn', () => {});
  try {
    for (const field of ['selectionType', 'handlePosition', 'lineWrapping']) {
      for (const invalid of ['invalid', true, null]) {
        assert.deepEqual(readSettings({
          'extension.markeditInteractiveTables': { ...overrides, [field]: invalid },
        }), {
          ...defaultSettings,
          ...overrides,
          tableCreationMenu: [{ rows: 10, cols: 10 }],
          [field]: defaultSettings[field],
        });

        assert.match(warning.mock.calls.at(-1).arguments[0], new RegExp(field));
      }
    }

    assert.equal(warning.mock.callCount(), 9);
  } finally {
    warning.mock.restore();
  }
});

test('invalid sizes do not discard valid core settings', () => {
  const warning = mock.method(console, 'warn', () => {});
  try {
    assert.deepEqual(readSettings({
      'extension.markeditInteractiveTables': { tableCreationMenu: ['bad'], lineWrapping: 'nowrap' },
    }), { ...defaultSettings, lineWrapping: 'nowrap' });
    assert.equal(warning.mock.callCount(), 1);
  } finally {
    warning.mock.restore();
  }
});

test('unsupported core options are not passed through from settings', () => {
  assert.deepEqual(readSettings({
    'extension.markeditInteractiveTables': {
      selectionType: 'native',
      theme: 'custom',
      style: { menuFontFamily: 'custom', color: 'red' },
      extensions: [],
      markdownConfig: {},
      globalKeyBindings: [],
    },
  }), { ...defaultSettings, selectionType: 'native' });
});

test('style fields validate independently using CSS property support', () => {
  const originalCSS = Object.getOwnPropertyDescriptor(globalThis, 'CSS');
  const supports = mock.fn((property, value) => ({
    'font-family': ['Menlo, monospace'],
    'font-size': ['14px', '1em'],
  })[property]?.includes(value) ?? false);

  Object.defineProperty(globalThis, 'CSS', { configurable: true, value: { supports } });
  const warning = mock.method(console, 'warn', () => {});

  try {
    const read = style => readSettings({
      'extension.markeditInteractiveTables': { style, handlePosition: 'inside' },
    });
    const custom = { fontFamily: 'Menlo, monospace', fontSize: '14px', defaultHeaderAlignment: 'center' };
    assert.deepEqual(read(custom), { ...defaultSettings, handlePosition: 'inside', style: custom });
    assert.deepEqual(read({ fontSize: '1em' }).style, { ...defaultSettings.style, fontSize: '1em' });
    assert.equal(warning.mock.callCount(), 0);
    assert.deepEqual(supports.mock.calls.map(call => call.arguments), [
      ['font-family', 'Menlo, monospace'], ['font-size', '14px'], ['font-size', '1em'],
    ]);

    assert.deepEqual(read({ fontFamily: null, fontSize: 'invalid', defaultHeaderAlignment: 'right' }).style, {
      ...defaultSettings.style, defaultHeaderAlignment: 'right',
    });

    assert.equal(warning.mock.callCount(), 2);
    assert.match(warning.mock.calls[0].arguments[0], /style.fontFamily/);
    assert.match(warning.mock.calls[1].arguments[0], /style.fontSize/);
    assert.deepEqual(read({ fontSize: '14px', defaultHeaderAlignment: 'justify' }).style, {
      ...defaultSettings.style, fontSize: '14px',
    });
    assert.equal(warning.mock.callCount(), 3);
    assert.match(warning.mock.calls[2].arguments[0], /style.defaultHeaderAlignment/);
  } finally {
    warning.mock.restore();
    if (originalCSS) {
      Object.defineProperty(globalThis, 'CSS', originalCSS);
    } else {
      delete globalThis.CSS;
    }
  }
});

test('invalid style containers fall back without losing other settings', () => {
  const warning = mock.method(console, 'warn', () => {});
  try {
    for (const style of [null, [], '14px', 14]) {
      assert.deepEqual(readSettings({
        'extension.markeditInteractiveTables': { style, tableCreationMenu: [], lineWrapping: 'nowrap' },
      }), { ...defaultSettings, tableCreationMenu: [], lineWrapping: 'nowrap' });
    }
    assert.equal(warning.mock.callCount(), 4);
  } finally {
    warning.mock.restore();
  }
});

test('accepts custom sizes and preserves their order', async () => {
  const { tableCreationMenu: sizes } = readSettings({
    'extension.markeditInteractiveTables': { tableCreationMenu: ['10x10', '2x3', '1x1'] },
  });
  assert.deepEqual(sizes, [{ rows: 10, cols: 10 }, { rows: 2, cols: 3 }, { rows: 1, cols: 1 }]);
  const result = await createTableCreationCompletion(sizes)(context());
  assert.deepEqual(result.options.map(option => option.label), [
    'Insert 10x10 table', 'Insert 2x3 table', 'Insert 1x1 table',
  ]);
});

test('localizes completion labels and matches localized text', async () => {
  const localized = createTableCreationCompletion(defaults, stringsForLocale('zh-CN'));
  const result = await localized(context({ doc: '|插入', pos: 3 }));
  assert.deepEqual(result.options.map(option => option.label), [
    '插入 2x2 表格',
    '插入 3x3 表格',
    '插入 4x4 表格',
  ]);
  assert.deepEqual(result.options.map(option => option.displayLabel), [
    '插入 2\u00d72 表格',
    '插入 3\u00d73 表格',
    '插入 4\u00d74 表格',
  ]);
});

test('an empty array disables table completion and its configuration', async () => {
  const settings = readSettings({
    'extension.markeditInteractiveTables': { tableCreationMenu: [] },
  });
  assert.deepEqual(settings.tableCreationMenu, []);
  const state = EditorState.create({ extensions: createTableCreationMenu(settings.tableCreationMenu) });
  assert.deepEqual(state.facet(markdownData), []);
  assert.deepEqual(state.facet(autocompleteConfig), []);
  assert.equal(await createTableCreationCompletion([])(context()), null);
});

for (const value of [false, true, '2x2', null, [2], ['0x2'], ['-2x2'], ['2x0'],
  ['2.5x3'], ['2X3'], ['2x3 '], ['2x2', 'bad'], ['9007199254740992x2']]) {
  test(`invalid sizes ${JSON.stringify(value)} warn and use defaults`, () => {
    const warning = mock.method(console, 'warn', () => {});
    try {
      assert.deepEqual(readSettings({
        'extension.markeditInteractiveTables': { tableCreationMenu: value },
      }), defaultSettings);
      assert.equal(warning.mock.callCount(), 1);
    } finally {
      warning.mock.restore();
    }
  });
}

test('invalid settings containers warn and use defaults', () => {
  const warning = mock.method(console, 'warn', () => {});
  try {
    for (const settings of [true, [], { 'extension.markeditInteractiveTables': null }]) {
      assert.deepEqual(readSettings(settings), defaultSettings);
    }
    assert.equal(warning.mock.callCount(), 3);
    assert.equal(warning.mock.calls.at(-1).arguments[0],
      'MarkEdit-interactive-tables: extension.markeditInteractiveTables must be an object.');
  } finally {
    warning.mock.restore();
  }
});
