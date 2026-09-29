import { syntaxTree } from '@codemirror/language';
import { isolateHistory } from '@codemirror/commands';
import { Compartment } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { MarkEdit } from 'markedit-api';
import { insertTable } from './creation.ts';
import { defaultTableSizes } from './settings.ts';
import { createSourceMode } from './source.ts';
import { localizedStrings } from './strings.ts';

import type { Extension } from '@codemirror/state';
import type { MenuItem } from 'markedit-api';
import type { TableSize } from './settings';
import type { LocalizedStrings } from './strings';

export function createTableControls(
  renderer: Extension,
  sizes: readonly TableSize[],
  strings: LocalizedStrings = localizedStrings,
): {
  extension: Extension;
  menu: MenuItem;
} {
  const compartment = new Compartment();
  const isRendered = (view: EditorView) => compartment.get(view.state) === renderer;
  const menuSizes = sizes.length === 0 ? defaultTableSizes : sizes;
  const setRendered = (view: EditorView | undefined, rendered: boolean) => {
    if (view === undefined || view.composing) {
      console.warn('MarkEdit-interactive-tables: table rendering cannot be toggled before the editor is ready or during composition.');
      return;
    }

    view.dispatch({
      effects: compartment.reconfigure(rendered ? renderer : sourceMode),
      selection: view.state.selection,
      scrollIntoView: true,
    });

    view.focus();
  };

  const sourceMode = createSourceMode(
    view => setRendered(view, true),
    strings.showVisualTables,
  );

  return {
    extension: compartment.of(renderer),
    menu: {
      title: strings.extensionMenu,
      children: [
        ...menuSizes.map(size => ({
          title: strings.insertTable(size.rows, size.cols),
          state: () => ({ isEnabled: canEdit(MarkEdit.editorView) }),
          action: () => {
            const view = MarkEdit.editorView;
            if (!canEdit(view)) {
              console.warn('MarkEdit-interactive-tables: table insertion requires an editable document with a single selection.');
              return;
            }

            const range = view.state.selection.main;
            const table = tableAtSelectionHead(view);
            if (table !== undefined) {
              const after = view.state.doc.lineAt(table.to).to;
              insertTable(view, size, { from: after, to: after });
              view.focus();
              return;
            }

            insertTable(view, size, range);
            view.focus();
          },
        })),
        { separator: true },
        {
          title: strings.copyTable,
          state: () => ({ isEnabled: focusedTable(MarkEdit.editorView) !== undefined }),
          action: async () => {
            const view = MarkEdit.editorView;
            const table = focusedTable(view);
            if (view === undefined || table === undefined) {
              console.warn('MarkEdit-interactive-tables: copying requires a focused table with a single selection outside composition.');
              return;
            }

            const markdown = view.state.sliceDoc(table.from, table.to);
            try {
              await navigator.clipboard.writeText(markdown);
            } catch (error) {
              console.error('MarkEdit-interactive-tables: failed to copy table.', error);
              await MarkEdit.showAlert(strings.failedToCopyTable);
            }
          },
        },
        {
          title: strings.deleteTable,
          state: () => ({
            isEnabled: canEdit(MarkEdit.editorView) && focusedTable(MarkEdit.editorView) !== undefined,
          }),
          action: () => {
            const view = MarkEdit.editorView;
            const table = focusedTable(view);
            if (!canEdit(view) || table === undefined) {
              console.warn('MarkEdit-interactive-tables: deleting requires a focused table in an editable document with a single selection outside composition.');
              return;
            }

            view.dispatch({
              changes: { from: table.from, to: table.to },
              selection: { anchor: table.from },
              annotations: isolateHistory.of('full'),
              userEvent: 'delete',
              scrollIntoView: true,
            });

            view.focus();
          },
        },
        {
          title: strings.viewSource,
          state: () => {
            const view = MarkEdit.editorView;
            return {
              isEnabled: view !== undefined && !view.composing,
              isSelected: view !== undefined && !isRendered(view),
            };
          },
          action: () => {
            const view = MarkEdit.editorView;
            setRendered(view, view !== undefined && !isRendered(view));
          },
        },
        { separator: true },
        {
          title: strings.help,
          action: () => open('https://github.com/MarkEdit-app/codemirror-markdown-tables#table-editor'),
        },
      ],
    },
  };
}

function canEdit(view: EditorView | undefined): view is EditorView {
  return view !== undefined && !view.state.readOnly && view.state.facet(EditorView.editable)
    && !view.composing && view.state.selection.ranges.length === 1;
}

function tableAtSelectionHead(view: EditorView): { from: number; to: number } | undefined {
  const tree = syntaxTree(view.state);
  for (const side of [-1, 1] as const) {
    let node = tree.resolveInner(view.state.selection.main.head, side);
    for (;;) {
      if (node.name === 'Table') {
        return { from: node.from, to: node.to };
      }

      const parent = node.parent;
      if (parent === null) {
        break;
      }

      node = parent;
    }
  }

  return undefined;
}

function focusedTable(view: EditorView | undefined): { from: number; to: number } | undefined {
  if (view === undefined || view.composing || view.state.selection.ranges.length !== 1) {
    return undefined;
  }

  const table = tableAtSelectionHead(view);
  const selection = view.state.selection.main;
  return table !== undefined && selection.from >= table.from && selection.to <= table.to
    ? table : undefined;
}
