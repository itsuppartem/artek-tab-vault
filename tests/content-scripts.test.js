/**
 * @jest-environment jsdom
 */
'use strict';

const { createMockBrowser, createDomSandbox, loadScriptInto, flushPromises } = require('./helpers/mock-browser');

function loadContent(relPath, options = {}) {
  const mock = createMockBrowser(options);
  const sandbox = createDomSandbox(mock.browser);
  loadScriptInto(sandbox, relPath);
  return { mock, sandbox };
}

describe('content-scripts/dirty-form.js', () => {
  let mock;

  beforeEach(() => {
    document.body.innerHTML = `
      <form id="f">
        <input id="name" type="text" />
        <textarea id="bio"></textarea>
        <select id="color"><option>red</option><option>blue</option></select>
        <div id="plain">not editable</div>
        <div id="edit" contenteditable="true">hello</div>
      </form>
    `;
    ({ mock } = loadContent('content-scripts/dirty-form.js'));
  });

  async function check() {
    return mock.browser.runtime.sendMessage({ type: 'TABVAULT_CHECK_DIRTY_FORM' });
  }

  test('starts clean and reports dirty after input on a form field', async () => {
    expect(await check()).toEqual({ dirty: false });
    document.getElementById('name').dispatchEvent(new Event('input', { bubbles: true }));
    expect(await check()).toEqual({ dirty: true });
  });

  test('marks dirty on textarea input and select change', async () => {
    document.getElementById('bio').dispatchEvent(new Event('input', { bubbles: true }));
    expect(await check()).toEqual({ dirty: true });
  });

  test('marks dirty on contenteditable input and ignores a plain div', async () => {
    document.getElementById('plain').dispatchEvent(new Event('input', { bubbles: true }));
    expect(await check()).toEqual({ dirty: false });
    const edit = document.getElementById('edit');
    Object.defineProperty(edit, 'isContentEditable', { value: true });
    edit.dispatchEvent(new Event('input', { bubbles: true }));
    expect(await check()).toEqual({ dirty: true });
  });

  test('submit clears the dirty flag', async () => {
    document.getElementById('name').dispatchEvent(new Event('input', { bubbles: true }));
    expect(await check()).toEqual({ dirty: true });
    document.getElementById('f').dispatchEvent(new Event('submit', { bubbles: true }));
    expect(await check()).toEqual({ dirty: false });
  });

  test('unknown messages return undefined', async () => {
    expect(await mock.browser.runtime.sendMessage({ type: 'SOMETHING_ELSE' })).toBeUndefined();
  });

  test('clears dirty on form reset and SPA navigation', async () => {
    document.getElementById('name').dispatchEvent(new Event('input', { bubbles: true }));
    expect(await check()).toEqual({ dirty: true });
    document.getElementById('f').dispatchEvent(new Event('reset', { bubbles: true }));
    expect(await check()).toEqual({ dirty: false });

    document.getElementById('name').dispatchEvent(new Event('input', { bubbles: true }));
    expect(await check()).toEqual({ dirty: true });
    window.dispatchEvent(new Event('popstate'));
    expect(await check()).toEqual({ dirty: false });

    document.getElementById('name').dispatchEvent(new Event('input', { bubbles: true }));
    window.history.pushState({}, '', '/spa-route');
    expect(await check()).toEqual({ dirty: false });
  });
});

describe('content-scripts/mark-discarded.js', () => {
  beforeEach(() => {
    document.title = 'Original Title';
  });

  test('prefixes the document title with the default sleep marker', async () => {
    loadContent('content-scripts/mark-discarded.js', {
      storage: { tabvault_settings: { discardedTitlePrefix: '💤 ' } },
    });
    await flushPromises(15);
    expect(document.title).toBe('💤 Original Title');
  });

  test('uses a custom prefix from settings and does not double-apply', async () => {
    document.title = '[sleep] Original Title';
    loadContent('content-scripts/mark-discarded.js', {
      storage: { tabvault_settings: { discardedTitlePrefix: '[sleep] ' } },
    });
    await flushPromises(15);
    expect(document.title).toBe('[sleep] Original Title');
  });

  test('falls back to the default prefix when settings are missing', async () => {
    loadContent('content-scripts/mark-discarded.js', { storage: {} });
    await flushPromises(15);
    expect(document.title).toBe('💤 Original Title');
  });
});
