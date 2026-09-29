import type { EditorView } from '@codemirror/view';

export function installTableClickWorkaround(view: EditorView): void {
  view.contentDOM.addEventListener('mousedown', event => {
    // Older MarkEdit versions mistake bubbled cell clicks for scrollbar clicks
    if (event.target instanceof Element && event.target.closest('.tbl-table-widget')) {
      event.stopPropagation();
    }
  });
}
