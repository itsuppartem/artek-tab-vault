/**
 * @jest-environment jsdom
 */
'use strict';

const { createMockBrowser, createDomSandbox, loadScriptInto } = require('./helpers/mock-browser');

function loadUi() {
  const mock = createMockBrowser();
  const sandbox = createDomSandbox(mock.browser);
  loadScriptInto(sandbox, 'ui-feedback.js');
  return sandbox.window.TabVaultUI;
}

describe('TabVaultUI', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    document.body.innerHTML = '<button id="btn">Save</button><div id="row">row</div>';
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('flashButton shows a success label then restores the original', () => {
    const UI = loadUi();
    const btn = document.getElementById('btn');
    UI.flashButton(btn, 'Saved', 1000);
    expect(btn.classList.contains('is-success')).toBe(true);
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toBe('✓ Saved');
    jest.advanceTimersByTime(1000);
    expect(btn.classList.contains('is-success')).toBe(false);
    expect(btn.disabled).toBe(false);
    expect(btn.textContent).toBe('Save');
  });

  test('flashElement adds and removes the pulse class', () => {
    const UI = loadUi();
    const row = document.getElementById('row');
    UI.flashElement(row, 650);
    expect(row.classList.contains('tv-flash')).toBe(true);
    jest.advanceTimersByTime(650);
    expect(row.classList.contains('tv-flash')).toBe(false);
  });

  test('both helpers no-op on a missing element', () => {
    const UI = loadUi();
    expect(() => UI.flashButton(null, 'x')).not.toThrow();
    expect(() => UI.flashElement(null)).not.toThrow();
  });
});
