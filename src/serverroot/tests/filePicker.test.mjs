import test from 'node:test';
import assert from 'node:assert/strict';
import { createFilePicker } from '../src/ui/FilePicker.js';

class Element {
  constructor() {
    this.children = [];
    this.attributes = {};
    this.listeners = {};
    this.classList = { add: name => { this.addedClass = name; } };
  }
  append(...children) { this.children.push(...children); }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, listener) { this.listeners[name] = listener; }
}

test('file picker presents accessible labels and selected filenames', () => {
  const previous = globalThis.document;
  globalThis.document = { createElement: () => new Element() };
  try {
    const input = new Element();
    input.files = [];
    const picker = createFilePicker('Cevap dosyası', input, { choose: 'Dosya seç', empty: 'Henüz dosya seçilmedi' });
    const [title, actualInput, control] = picker.element.children;
    const [action, filename] = control.children;
    assert.equal(title.textContent, 'Cevap dosyası');
    assert.equal(actualInput, input);
    assert.equal(input.attributes['aria-label'], 'Cevap dosyası');
    assert.equal(action.textContent, 'Dosya seç');
    assert.equal(filename.textContent, 'Henüz dosya seçilmedi');
    input.files = [{ name: 'one.csv' }, { name: 'two.csv' }];
    input.listeners.change();
    assert.equal(filename.textContent, 'one.csv, two.csv');
    input.files = [];
    picker.update();
    assert.equal(filename.textContent, 'Henüz dosya seçilmedi');
  } finally { globalThis.document = previous; }
});
