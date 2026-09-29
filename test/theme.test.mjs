import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

const base = {
  props: { '--tbl-theme-row-background': '#fff', '--tbl-theme-outline-color': '#08f' },
  with: props => ({ props }),
};

const host = { editorConfig: { theme: 'custom' } };
mock.module('markedit-api', { namedExports: { MarkEdit: host } });
mock.module('codemirror-markdown-tables', {
  namedExports: { TableTheme: { githubLight: base, githubDark: base } },
});

const { adaptiveTableTheme, syncTableColors, tableTheme } = await import('../src/theme.ts');

test('cell display and editor layers inherit the cell font size without overriding the document', () => {
  const state = EditorState.create({ extensions: tableTheme });
  const rules = state.facet(EditorView.styleModule).flatMap(module => module.getRules().split('\n'));
  const fontRules = rules.filter(rule => rule.includes('font-size:'));
  assert.equal(fontRules.length, 1);
  assert.ok(fontRules[0].endsWith('{font-size: inherit;}'));

  const selectors = fontRules[0].slice(0, fontRules[0].indexOf(' {')).split(', ')
    .map(selector => selector.replace(/^\.\S+ /, ''));
  assert.deepEqual(selectors, [
    '.tbl-cell-view',
    '.tbl-cell-editor .cm-editor',
    '.tbl-cell-editor .cm-editor .cm-scroller',
    '.tbl-cell-editor .cm-editor .cm-content',
    '.tbl-cell-editor .cm-editor .cm-line',
  ]);
});

test('both schemes use adaptive overrides with the original palette as fallback', () => {
  for (const theme of Object.values(adaptiveTableTheme)) {
    assert.equal(theme.props['--tbl-theme-row-background'], 'var(--mit-theme-row-background, #fff)');
    assert.equal(theme.props['--tbl-theme-outline-color'], 'var(--mit-theme-outline-color, #08f)');
  }
});

test('samples host colors, refreshes on theme changes, and removes its resources', () => {
  const elements = [];
  const window = new EventTarget();
  let palette = { color: 'rgb(20, 30, 40)', backgroundColor: 'rgb(250, 240, 230)', borderLeftColor: 'rgb(30, 80, 150)' };
  window.getComputedStyle = element => element.transparent
    ? { ...palette, backgroundColor: 'rgba(0, 0, 0, 0)' } : palette;

  const document = {
    defaultView: window,
    head: { appendChild() {} },
    createElement: () => {
      const element = { style: {}, setAttribute() {}, remove: mock.fn(), textContent: '' };
      elements.push(element);
      return element;
    },
  };

  const view = {
    dom: { ownerDocument: document, appendChild() {}, transparent: true, parentElement: {} },
    contentDOM: {},
    requestMeasure: mock.fn(({ read, write }) => write(read())),
  };

  const plugin = syncTableColors.create(view);
  const [style, cursor] = elements;
  assert.match(style.textContent, /--mit-background: rgb\(250, 240, 230\)/);
  assert.match(style.textContent, /--mit-foreground: rgb\(20, 30, 40\)/);
  assert.match(style.textContent, /--mit-accent: rgb\(30, 80, 150\)/);
  assert.equal(cursor.className, 'cm-cursor');
  assert.doesNotMatch(style.textContent, /--tbl-theme-/);
  assert.match(style.textContent, /foreground.*4%/);
  assert.match(style.textContent, /accent.*24%, transparent/);

  for (const theme of ['github', 'github-light', 'github-dark']) {
    host.editorConfig.theme = theme;
    window.dispatchEvent(new Event('editor-colors-changed'));
    assert.equal(style.textContent, '');
  }

  host.editorConfig.theme = 'custom';
  window.dispatchEvent(new Event('editor-colors-changed'));
  assert.match(style.textContent, /--mit-theme-row-background/);

  palette = { color: '#eee', backgroundColor: '#123', borderLeftColor: '#abc' };
  window.dispatchEvent(new Event('editor-colors-changed'));
  assert.match(style.textContent, /--mit-background: #123/);

  const calls = view.requestMeasure.mock.callCount();
  plugin.update({
    startState: { facet: facet => facet === EditorView.darkTheme ? false : undefined },
    state: { facet: facet => facet === EditorView.darkTheme ? true : undefined },
    transactions: [],
  });

  assert.equal(view.requestMeasure.mock.callCount(), calls + 1);
  plugin.update({
    startState: { facet: () => true }, state: { facet: () => true },
    transactions: [{ reconfigured: true }],
  });

  assert.equal(view.requestMeasure.mock.callCount(), calls + 2);
  plugin.destroy();
  window.dispatchEvent(new Event('editor-colors-changed'));

  assert.equal(view.requestMeasure.mock.callCount(), calls + 2);
  assert.equal(style.remove.mock.callCount(), 1);
  assert.equal(cursor.remove.mock.callCount(), 1);
});
