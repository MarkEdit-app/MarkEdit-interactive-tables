import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

import { createSourceMode } from '../src/source.ts';

function setup() {
  const buttons = [];
  const listeners = new Map();
  const disconnect = mock.fn();
  let observeChanges;

  class Element {
    constructor(type = 'table', title = 'Preview') {
      this.attributes = new Map([['class', 'cm-md-previewButton'], ['data-type', type]]);
      if (title !== null) {
        this.attributes.set('title', title);
      }
    }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    setAttribute(name, value) { this.attributes.set(name, value); }
    removeAttribute(name) { this.attributes.delete(name); }
    matches(selector) {
      assert.equal(selector, '.cm-md-previewButton[data-type="table"]');
      return this.getAttribute('class') === 'cm-md-previewButton' && this.getAttribute('data-type') === 'table';
    }
    closest(selector) { return this.matches(selector) ? this : this.parent?.closest(selector) ?? null; }
  }

  const dom = {
    ownerDocument: {
      defaultView: {
        Element,
        MutationObserver: class {
          constructor(callback) { observeChanges = callback; }
          observe(target, options) {
            assert.equal(target, dom);
            assert.equal(options.childList, true);
            assert.equal(options.subtree, true);
          }
          disconnect = disconnect;
        },
      },
    },
    contains: button => buttons.includes(button),
    querySelectorAll: selector => buttons.filter(button => button.matches(selector)),
    addEventListener(type, handler, capture) {
      assert.equal(capture, true);
      listeners.set(type, handler);
    },
    removeEventListener(type, handler, capture) {
      assert.equal(capture, true);
      assert.equal(handler, listeners.get(type));
      listeners.delete(type);
    },
  };

  const view = { dom };
  const showVisual = mock.fn();
  const addButton = (type, title) => {
    const button = new Element(type, title);
    buttons.push(button);
    return button;
  };

  const table = addButton();
  const math = addButton('katex');
  const diagram = addButton('mermaid');
  const plugin = createSourceMode(showVisual, 'Show Visual Tables').create(view);
  const click = target => {
    const event = { target, preventDefault: mock.fn(), stopImmediatePropagation: mock.fn() };
    listeners.get('click')?.(event);
    return event;
  };

  return {
    buttons,
    listeners,
    Element,
    view,
    showVisual,
    addButton,
    table,
    math,
    diagram,
    plugin,
    click,
    refresh: () => observeChanges(),
    disconnect,
  };
}

test('overrides only table tooltips, including buttons created after entering source mode', () => {
  const fixture = setup();
  assert.equal(fixture.table.getAttribute('title'), 'Show Visual Tables');
  assert.equal(fixture.math.getAttribute('title'), 'Preview');
  assert.equal(fixture.diagram.getAttribute('title'), 'Preview');

  const added = fixture.addButton('table', null);
  fixture.refresh();
  assert.equal(added.getAttribute('title'), 'Show Visual Tables');
  fixture.plugin.destroy();
  assert.equal(fixture.table.getAttribute('title'), 'Preview');
  assert.equal(added.getAttribute('title'), null);
  assert.equal(fixture.disconnect.mock.callCount(), 1);
  assert.equal(fixture.listeners.size, 0);
});

test('captures table and nested-icon clicks before the host preview handler', () => {
  const fixture = setup();
  const child = new fixture.Element('icon');
  child.parent = fixture.table;

  for (const target of [fixture.table, child]) {
    const event = fixture.click(target);
    assert.equal(event.preventDefault.mock.callCount(), 1);
    assert.equal(event.stopImmediatePropagation.mock.callCount(), 1);
  }

  assert.equal(fixture.showVisual.mock.callCount(), 2);
  assert.equal(fixture.showVisual.mock.calls[0].arguments[0], fixture.view);
  fixture.plugin.destroy();
});

test('leaves other previews, outside buttons, and unrelated clicks untouched', () => {
  const fixture = setup();
  for (const target of [fixture.math, fixture.diagram, new fixture.Element(), {}, null]) {
    const event = fixture.click(target);
    assert.equal(event.preventDefault.mock.callCount(), 0);
    assert.equal(event.stopImmediatePropagation.mock.callCount(), 0);
  }

  assert.equal(fixture.showVisual.mock.callCount(), 0);
  fixture.plugin.destroy();
});

test('restores removed or repurposed buttons and preserves externally changed tooltips', () => {
  const fixture = setup();
  fixture.table.setAttribute('data-type', 'mermaid');
  fixture.refresh();
  assert.equal(fixture.table.getAttribute('title'), 'Preview');

  const removed = fixture.addButton();
  fixture.refresh();
  fixture.buttons.splice(fixture.buttons.indexOf(removed), 1);
  fixture.refresh();
  assert.equal(removed.getAttribute('title'), 'Preview');

  const changed = fixture.addButton();
  fixture.refresh();
  changed.setAttribute('title', 'New host tooltip');
  fixture.plugin.destroy();
  assert.equal(changed.getAttribute('title'), 'New host tooltip');
});
