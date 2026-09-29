import { syntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { insertEmptyMarkdownTable } from 'codemirror-markdown-tables';
import { MarkEdit } from 'markedit-api';
import { localizedStrings } from './strings.ts';

import type { Completion, CompletionContext, CompletionResult, CompletionSource } from '@codemirror/autocomplete';
import type { Extension } from '@codemirror/state';
import type { TableSize } from './settings';
import type { LocalizedStrings } from './strings';

const { autocompletion, pickedCompletion } = MarkEdit.codemirror.autocomplete;
const filterText = /^[\p{L}\p{N} \u00d7]*$/u;

export function createTableCreationCompletion(
  sizes: readonly TableSize[],
  strings: LocalizedStrings = localizedStrings,
): CompletionSource {
  const complete = (context: CompletionContext): CompletionResult | null => {
    const { state, pos, view } = context;
    const selection = state.selection.main;
    if (sizes.length === 0 || state.readOnly || !state.facet(EditorView.editable) || view?.composing
      || state.selection.ranges.length !== 1 || !selection.empty || selection.head !== pos) {
      return null;
    }

    const line = state.doc.lineAt(pos);
    if (pos !== line.to || !line.text.startsWith('|') || line.text.startsWith('| ')
      || !filterText.test(line.text.slice(1))) {
      return null;
    }

    let node = syntaxTree(state).resolveInner(pos, -1);
    for (;;) {
      if (node.name === 'FencedCode' || node.name === 'CodeBlock' || node.name === 'InlineCode') {
        return null;
      }

      const parent = node.parent;
      if (parent === null) {
        break;
      }

      node = parent;
    }

    const query = line.text.slice(1).toLowerCase().replace(/\u00d7/g, 'x');
    return {
      from: line.from + 1,
      to: pos,
      // CodeMirror's one-character matcher only checks the start of the label
      filter: false,
      update: (_result, _from, _to, context) => complete(context),
      getMatch: option => {
        const offset = option.label.toLowerCase().indexOf(query);
        return query.length > 0 ? [offset, offset + query.length] : [];
      },
      options: sizes.map<Completion>(size => {
        const displayLabel = strings.insertTable(size.rows, size.cols);
        return {
          label: displayLabel.replace('\u00d7', 'x'),
          displayLabel,
          type: 'table',
          apply: (editor, completion, from, to) => {
            insertTable(editor, size, { from: from - 1, to }, completion);
          },
        };
      }).filter(option => option.label.toLowerCase().includes(query)),
    };
  };

  return complete;
}

export function insertTable(
  editor: EditorView,
  size: TableSize,
  range: { from: number; to: number } = editor.state.selection.main,
  completion?: Completion,
): void {
  // Compute insertion without constructing table widgets for a discarded editor state
  const insertionState = EditorState.create({
    doc: editor.state.doc,
    selection: { anchor: range.from, head: range.to },
    extensions: EditorState.lineSeparator.of(editor.state.lineBreak),
  });
  insertEmptyMarkdownTable({ size })({
    state: insertionState,
    dispatch: transaction => editor.dispatch({
      changes: transaction.changes,
      selection: transaction.selection,
      effects: transaction.effects,
      annotations: completion === undefined ? undefined : pickedCompletion.of(completion),
      userEvent: completion === undefined ? 'input' : 'input.complete',
      scrollIntoView: true,
    }),
  });
}

export function createTableCreationMenu(
  sizes: readonly TableSize[],
  strings: LocalizedStrings = localizedStrings,
): Extension {
  if (sizes.length === 0) {
    return [];
  }

  return [
    MarkEdit.codemirror.langMarkdown.markdownLanguage.data.of({
      autocomplete: createTableCreationCompletion(sizes, strings),
    }),
    autocompletion({
      optionClass: option => option.type === 'table' ? 'tbl-table-completion' : '',
    }),
  ];
}
