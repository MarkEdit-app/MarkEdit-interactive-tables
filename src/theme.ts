import { EditorView, ViewPlugin } from '@codemirror/view';
import { TableTheme, type TableThemeProps } from 'codemirror-markdown-tables';
import { MarkEdit } from 'markedit-api';

function derivedColors(): TableThemeProps {
  const background = 'var(--mit-background, Canvas)';
  const foreground = 'var(--mit-foreground, CanvasText)';
  const accent = 'var(--mit-accent, Highlight)';
  const props: TableThemeProps = {
    '--tbl-theme-row-background': background,
    '--tbl-theme-header-row-background': background,
    '--tbl-theme-even-row-background': background,
    '--tbl-theme-odd-row-background': `color-mix(in srgb, ${background}, ${foreground} 4%)`,
    '--tbl-theme-text-color': foreground,
    '--tbl-theme-border-color': `color-mix(in srgb, ${background}, ${foreground} 20%)`,
    '--tbl-theme-border-hover-color': `color-mix(in srgb, ${background}, ${accent} 55%)`,
    '--tbl-theme-border-active-color': accent,
    '--tbl-theme-outline-color': accent,
    '--tbl-theme-select-all-focus-overlay': `color-mix(in srgb, ${accent} 24%, transparent)`,
    '--tbl-theme-select-all-blur-overlay': `color-mix(in srgb, ${foreground} 15%, transparent)`,
  };

  return props;
}

const adaptiveColors = derivedColors();
const adaptiveVariable = (name: string) => name.replace('--tbl-theme-', '--mit-theme-');

function editorColors(base: TableTheme): TableTheme {
  return base.with(Object.fromEntries(Object.keys(adaptiveColors).map(name => [
    name,
    `var(${adaptiveVariable(name)}, ${base.props[name as keyof TableThemeProps]})`,
  ])));
}

export const adaptiveTableTheme = {
  light: editorColors(TableTheme.githubLight),
  dark: editorColors(TableTheme.githubDark),
};

export const syncTableColors = ViewPlugin.define(view => {
  const document = view.dom.ownerDocument;
  const window = document.defaultView!;

  // TableTheme variables resolve at :root, so their sampled inputs must live there too
  const style = document.createElement('style');
  const cursor = document.createElement('span');
  cursor.className = 'cm-cursor';
  cursor.style.cssText = 'display: none;';
  cursor.setAttribute('aria-hidden', 'true');

  view.dom.appendChild(cursor);
  document.head.appendChild(style);
  let destroyed = false;

  const refresh = () => view.requestMeasure({
    key: style,
    read: () => {
      if (/^github(?:-light|-dark)?$/.test(MarkEdit.editorConfig.theme)) {
        return '';
      }

      const foreground = window.getComputedStyle(view.contentDOM).color;
      let background = 'Canvas';
      for (let element: HTMLElement | null = view.dom; element; element = element.parentElement) {
        const color = window.getComputedStyle(element).backgroundColor;
        if (color !== 'transparent' && color !== 'rgba(0, 0, 0, 0)') {
          background = color;
          break;
        }
      }

      const accent = window.getComputedStyle(cursor).borderLeftColor;
      const colors = Object.entries(adaptiveColors).map(([name, value]) => `${adaptiveVariable(name)}: ${value};`).join(' ');
      return `:root { --mit-background: ${background}; --mit-foreground: ${foreground}; --mit-accent: ${accent}; ${colors} }`;
    },
    write: css => {
      if (!destroyed && style.textContent !== css) {
        style.textContent = css;
      }
    },
  });

  window.addEventListener('editor-colors-changed', refresh);
  refresh();

  return {
    update(update) {
      if (update.startState.facet(EditorView.darkTheme) !== update.state.facet(EditorView.darkTheme)
        || update.transactions.some(transaction => transaction.reconfigured)) {
        refresh();
      }
    },
    destroy() {
      destroyed = true;
      window.removeEventListener('editor-colors-changed', refresh);
      cursor.remove();
      style.remove();
    },
  };
});

export const tableTheme = EditorView.theme({
  '.tbl-table-wrapper': {
    marginLeft: '10px',
    marginRight: '10px',
  },
  // The cell applies the configured size once; relative units must not compound
  '.tbl-cell-view, .tbl-cell-editor .cm-editor, .tbl-cell-editor .cm-editor .cm-scroller, .tbl-cell-editor .cm-editor .cm-content, .tbl-cell-editor .cm-editor .cm-line': {
    fontSize: 'inherit',
  },
  // Keep the width while CodeMirror displays old rows during a completion refresh
  '.cm-tooltip-autocomplete > ul:has(> .tbl-table-completion):not(:has(> li:not(.tbl-table-completion)))': {
    minWidth: '0',
  },
});
