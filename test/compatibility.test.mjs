import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { installTableClickWorkaround } from '../src/compatibility.ts';

let root;
let originalElement;

class ElementStub {
  constructor(inTable) {
    this.inTable = inTable;
  }

  closest(selector) {
    return this.inTable && selector === '.tbl-table-widget' ? this : null;
  }
}

beforeEach(() => {
  root = { contentDOM: { addEventListener: mock.fn() } };
  originalElement = Object.getOwnPropertyDescriptor(globalThis, 'Element');
  Object.defineProperty(globalThis, 'Element', { configurable: true, value: ElementStub });
});

afterEach(() => {
  mock.restoreAll();
  if (originalElement) {
    Object.defineProperty(globalThis, 'Element', originalElement);
  } else {
    delete globalThis.Element;
  }
});

test('installs only the click workaround without host version information', () => {
  installTableClickWorkaround(root);
  assert.deepEqual(root.contentDOM.addEventListener.mock.calls.map(call => call.arguments[0]), ['mousedown']);
});

test('stops only table mousedown propagation', () => {
  installTableClickWorkaround(root);
  const listener = root.contentDOM.addEventListener.mock.calls[0].arguments[1];
  for (const [target, expected] of [[new ElementStub(true), 1], [new ElementStub(false), 0], [null, 0]]) {
    const stopPropagation = mock.fn();
    listener({ target, stopPropagation });
    assert.equal(stopPropagation.mock.callCount(), expected);
  }
});
