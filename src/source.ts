import { ViewPlugin } from '@codemirror/view';
import type { EditorView } from '@codemirror/view';

const tablePreviewSelector = '.cm-md-previewButton[data-type="table"]';

export function createSourceMode(showVisual: (view: EditorView) => void, title: string) {
  return ViewPlugin.define(view => {
    const window = view.dom.ownerDocument.defaultView!;
    const titles = new Map<Element, string | null>();

    const restoreTitle = (button: Element, original: string | null) => {
      if (button.getAttribute('title') !== title) {
        return;
      }

      if (original === null) {
        button.removeAttribute('title');
      } else {
        button.setAttribute('title', original);
      }
    };

    const refresh = () => {
      for (const [button, original] of titles) {
        if (!view.dom.contains(button) || !button.matches(tablePreviewSelector)) {
          restoreTitle(button, original);
          titles.delete(button);
        }
      }

      for (const button of view.dom.querySelectorAll(tablePreviewSelector)) {
        if (!titles.has(button)) {
          titles.set(button, button.getAttribute('title'));
        }

        if (button.getAttribute('title') !== title) {
          button.setAttribute('title', title);
        }
      }
    };

    const click = (event: MouseEvent) => {
      const button = event.target instanceof window.Element
        ? event.target.closest(tablePreviewSelector) : null;
      if (button === null || !view.dom.contains(button)) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      showVisual(view);
    };

    // Capture before the host's CodeMirror click handler opens its preview overlay
    view.dom.addEventListener('click', click, true);
    const observer = new window.MutationObserver(refresh);
    observer.observe(view.dom, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-type', 'class'] });
    refresh();

    return {
      destroy() {
        observer.disconnect();
        view.dom.removeEventListener('click', click, true);
        for (const [button, original] of titles) {
          restoreTitle(button, original);
        }

        titles.clear();
      },
    };
  });
}
