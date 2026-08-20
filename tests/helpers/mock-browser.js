'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { TextEncoder, TextDecoder } = require('util');

const ROOT = path.join(__dirname, '../..');

async function flushPromises(times = 25) {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
}

function flattenI18n(messagesJson) {
  const out = {};
  for (const [key, value] of Object.entries(messagesJson || {})) {
    out[key] = value && value.message != null ? value.message : value;
  }
  return out;
}

function loadEnI18n() {
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, '_locales/en/messages.json'), 'utf8'));
  return flattenI18n(raw);
}

function extractHtmlBody(relPath) {
  const html = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
  const match = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const body = match ? match[1] : html;
  return body.replace(/<script\b[\s\S]*?<\/script>/gi, '');
}

function createSandbox(globals) {
  const sandbox = { ...globals };
  if (!sandbox.globalThis) sandbox.globalThis = sandbox;
  if (!sandbox.self) sandbox.self = sandbox;
  vm.createContext(sandbox);
  return sandbox;
}

function loadScriptInto(sandbox, relPath) {
  const filename = path.join(ROOT, relPath);
  const code = fs.readFileSync(filename, 'utf8');
  vm.runInContext(code, sandbox, { filename });
}

function createDomSandbox(browser) {
  window.browser = browser;
  const sandbox = {
    window,
    document,
    browser,
    console,
    Date,
    Math,
    Number,
    Boolean,
    String,
    Array,
    Object,
    Map,
    Set,
    Promise,
    JSON,
    URL,
    TextEncoder,
    Blob: global.Blob,
    File: global.File,
    Event: global.Event,
    CustomEvent: global.CustomEvent,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
  };
  sandbox.self = window;
  sandbox.globalThis = window;
  vm.createContext(sandbox);
  return sandbox;
}

function loadUiPage(browser, htmlRel, scriptRel) {
  document.body.innerHTML = extractHtmlBody(htmlRel);
  const sandbox = createDomSandbox(browser);
  loadScriptInto(sandbox, 'core.js');
  loadScriptInto(sandbox, 'i18n.js');
  loadScriptInto(sandbox, 'ui-feedback.js');
  sandbox.TabVaultCore = window.TabVaultCore;
  sandbox.TabVaultI18n = window.TabVaultI18n;
  sandbox.TabVaultUI = window.TabVaultUI;
  loadScriptInto(sandbox, scriptRel);
  return sandbox;
}

function loadPopup(browser) {
  return loadUiPage(browser, 'popup/popup.html', 'popup/popup.js');
}

function loadOptions(browser) {
  return loadUiPage(browser, 'options/options.html', 'options/options.js');
}

function loadBackground(browser) {
  const sandbox = createSandbox({
    browser,
    console,
    Date,
    Math,
    Number,
    Boolean,
    String,
    Array,
    Object,
    Map,
    Set,
    Promise,
    JSON,
    URL,
    TextEncoder,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
  });
  loadScriptInto(sandbox, 'core.js');
  loadScriptInto(sandbox, 'background.js');
  return sandbox;
}

function createMockBrowser(options = {}) {
  const storageData = { ...(options.storage || {}) };
  const localeMessages = options.i18n || {};

  let nextTabId = options.nextTabId || 1;
  let nextWindowId = options.nextWindowId || 1;
  let nextGroupId = options.nextGroupId || 1;

  const windows = [];
  const tabs = [];
  const groups = [];

  const calls = {
    alarmsCreate: [],
    tabsDiscard: [],
    tabsCreate: [],
    tabsUpdate: [],
    tabsGroup: [],
    tabGroupsUpdate: [],
    executeScript: [],
    sendMessage: [],
    notificationsCreate: [],
    openOptionsPage: [],
    setBadgeText: [],
    setBadgeBackgroundColor: [],
    windowsCreate: [],
  };

  function syncWindowTabs(windowId) {
    const win = windows.find((w) => w.id === windowId);
    if (!win) return;
    win.tabs = tabs.filter((t) => t.windowId === windowId).sort((a, b) => a.index - b.index);
  }

  function addWindow(w = {}) {
    const win = {
      id: w.id != null ? w.id : nextWindowId++,
      focused: !!w.focused,
      type: w.type || 'normal',
    };
    if (w.id != null) nextWindowId = Math.max(nextWindowId, w.id + 1);
    windows.push(win);
    for (const t of w.tabs || []) {
      addTab({ ...t, windowId: win.id });
    }
    for (const g of w.groups || []) {
      groups.push({
        id: g.id,
        windowId: win.id,
        title: g.title || '',
        color: g.color || 'grey',
        collapsed: !!g.collapsed,
      });
      if (typeof g.id === 'number') nextGroupId = Math.max(nextGroupId, g.id + 1);
    }
    syncWindowTabs(win.id);
    return win;
  }

  function addTab(t = {}) {
    const windowId = t.windowId != null ? t.windowId : (windows[0] && windows[0].id) || addWindow({ focused: true }).id;
    const tab = {
      id: t.id != null ? t.id : nextTabId++,
      windowId,
      url: t.url || 'about:blank',
      title: t.title || t.url || '',
      favIconUrl: t.favIconUrl || null,
      pinned: !!t.pinned,
      discarded: !!t.discarded,
      active: !!t.active,
      audible: !!t.audible,
      index: t.index != null ? t.index : tabs.filter((x) => x.windowId === windowId).length,
      groupId: typeof t.groupId === 'number' ? t.groupId : -1,
    };
    if (t.id != null) nextTabId = Math.max(nextTabId, t.id + 1);
    tabs.push(tab);
    syncWindowTabs(windowId);
    return tab;
  }

  if (options.windows) {
    options.windows.forEach((w, i) => addWindow({ focused: w.focused != null ? w.focused : i === 0, ...w }));
  }

  const storageListeners = [];
  const messageListeners = [];
  const alarmListeners = [];
  const commandListeners = [];
  const tabActivatedListeners = [];
  const tabRemovedListeners = [];
  const windowRemovedListeners = [];
  const notificationClickedListeners = [];
  const installedListeners = [];
  const startupListeners = [];
  const tabMessageHandlers = options.tabMessageHandlers || {};
  const alarms = new Map();

  const browser = {
    storage: {
      local: {
        async get(keys) {
          if (keys == null) return { ...storageData };
          if (typeof keys === 'string') {
            const out = {};
            if (keys in storageData) out[keys] = storageData[keys];
            return out;
          }
          if (Array.isArray(keys)) {
            const out = {};
            for (const k of keys) if (k in storageData) out[k] = storageData[k];
            return out;
          }
          const out = {};
          for (const k of Object.keys(keys)) {
            out[k] = k in storageData ? storageData[k] : keys[k];
          }
          return out;
        },
        async set(obj) {
          const changes = {};
          for (const [k, v] of Object.entries(obj)) {
            changes[k] = { oldValue: storageData[k], newValue: v };
            storageData[k] = v;
          }
          for (const listener of storageListeners) listener(changes, 'local');
        },
      },
      onChanged: {
        addListener(fn) {
          storageListeners.push(fn);
        },
      },
    },
    runtime: {
      onMessage: {
        addListener(fn) {
          messageListeners.push(fn);
        },
      },
      sendMessage: async (message) => {
        calls.sendMessage.push(message);
        if (options.sendMessage) return options.sendMessage(message);
        let result;
        for (const listener of messageListeners) {
          const r = listener(message);
          if (r !== undefined) result = await r;
        }
        return result;
      },
      getURL: (p) => p,
      openOptionsPage: async () => {
        calls.openOptionsPage.push(true);
      },
      onInstalled: {
        addListener(fn) {
          installedListeners.push(fn);
        },
      },
      onStartup: {
        addListener(fn) {
          startupListeners.push(fn);
        },
      },
    },
    tabs: {
      query: async (q = {}) => {
        return tabs
          .filter((tab) => {
            if (q.windowId != null && tab.windowId !== q.windowId) return false;
            if (q.active != null && tab.active !== q.active) return false;
            if (q.currentWindow === true) {
              const focused = windows.find((w) => w.focused) || windows[0];
              if (!focused || tab.windowId !== focused.id) return false;
            }
            if (q.discarded != null && tab.discarded !== q.discarded) return false;
            return true;
          })
          .map((t) => ({ ...t }));
      },
      sendMessage: async (tabId, message) => {
        const handler = Object.prototype.hasOwnProperty.call(tabMessageHandlers, tabId)
          ? tabMessageHandlers[tabId]
          : options.defaultTabMessage;
        if (handler === 'throw' || handler === undefined) {
          throw new Error('Could not establish connection. Receiving end does not exist.');
        }
        if (typeof handler === 'function') return handler(message);
        return handler;
      },
      executeScript: async (tabId, details) => {
        calls.executeScript.push({ tabId, details });
        if (options.executeScript === 'throw') throw new Error('injection refused');
      },
      discard: async (tabId) => {
        calls.tabsDiscard.push(tabId);
        if (options.discard === 'throw') throw new Error('cannot discard');
        const tab = tabs.find((t) => t.id === tabId);
        if (tab) tab.discarded = true;
      },
      create: async (createProps) => {
        calls.tabsCreate.push(createProps);
        const focused = windows.find((w) => w.focused) || windows[0] || addWindow({ focused: true });
        const windowId = createProps.windowId != null ? createProps.windowId : focused.id;
        const tab = addTab({
          url: createProps.url,
          pinned: !!createProps.pinned,
          windowId,
          active: !!createProps.active,
        });
        return { ...tab };
      },
      update: async (tabId, props) => {
        calls.tabsUpdate.push({ tabId, props: { ...props } });
        const tab = tabs.find((t) => t.id === tabId);
        if (tab) Object.assign(tab, props);
        if (props && props.active && tab) {
          for (const t of tabs) {
            if (t.windowId === tab.windowId) t.active = t.id === tabId;
          }
        }
        return tab ? { ...tab } : { id: tabId, ...props };
      },
      group: async ({ tabIds }) => {
        calls.tabsGroup.push({ tabIds: [...tabIds] });
        const id = nextGroupId++;
        for (const tid of tabIds) {
          const tab = tabs.find((t) => t.id === tid);
          if (tab) tab.groupId = id;
        }
        return id;
      },
      onActivated: {
        addListener(fn) {
          tabActivatedListeners.push(fn);
        },
      },
      onRemoved: {
        addListener(fn) {
          tabRemovedListeners.push(fn);
        },
      },
    },
    windows: {
      getAll: async (opts = {}) => {
        if (opts.populate) {
          return windows.map((w) => ({
            id: w.id,
            focused: w.focused,
            type: w.type,
            tabs: tabs.filter((t) => t.windowId === w.id).sort((a, b) => a.index - b.index).map((t) => ({ ...t })),
          }));
        }
        return windows.map((w) => ({ id: w.id, focused: w.focused, type: w.type }));
      },
      getLastFocused: async () => {
        const w = windows.find((x) => x.focused) || windows[0];
        if (!w) throw new Error('No window');
        return {
          id: w.id,
          focused: w.focused,
          type: w.type,
          tabs: tabs.filter((t) => t.windowId === w.id).map((t) => ({ ...t })),
        };
      },
      create: async ({ url } = {}) => {
        const urls = url == null ? ['about:blank'] : Array.isArray(url) ? url : [url];
        calls.windowsCreate.push({ url: urls });
        const win = addWindow({ focused: true });
        for (const u of urls) addTab({ url: u, windowId: win.id, pinned: false });
        const winTabs = tabs.filter((t) => t.windowId === win.id);
        if (winTabs[0]) winTabs[0].active = true;
        return { id: win.id, focused: true, type: 'normal', tabs: winTabs.map((t) => ({ ...t })) };
      },
      onRemoved: {
        addListener(fn) {
          windowRemovedListeners.push(fn);
        },
      },
    },
    tabGroups: {
      query: async ({ windowId } = {}) => {
        return groups.filter((g) => windowId == null || g.windowId === windowId).map((g) => ({ ...g }));
      },
      update: async (groupId, props) => {
        calls.tabGroupsUpdate.push({ groupId, props: { ...props } });
        const g = groups.find((x) => x.id === groupId);
        if (g) Object.assign(g, props);
        else groups.push({ id: groupId, ...props });
        return { id: groupId, ...props };
      },
    },
    alarms: {
      create: (name, info) => {
        calls.alarmsCreate.push({ name, info: { ...info } });
        alarms.set(name, info);
      },
      onAlarm: {
        addListener(fn) {
          alarmListeners.push(fn);
        },
      },
    },
    browserAction: {
      setBadgeBackgroundColor: async (x) => {
        calls.setBadgeBackgroundColor.push(x);
      },
      setBadgeText: async (x) => {
        calls.setBadgeText.push(x);
      },
    },
    notifications: {
      create: async (id, notifOptions) => {
        calls.notificationsCreate.push({ id, options: notifOptions });
        return id;
      },
      clear: async () => {},
      onClicked: {
        addListener(fn) {
          notificationClickedListeners.push(fn);
        },
      },
    },
    commands: {
      onCommand: {
        addListener(fn) {
          commandListeners.push(fn);
        },
      },
    },
    i18n: {
      getMessage(key, substitutions) {
        const entry = localeMessages[key];
        let msg = typeof entry === 'string' ? entry : entry && entry.message;
        if (!msg) return '';
        const subs = substitutions == null ? [] : Array.isArray(substitutions) ? substitutions : [substitutions];
        subs.forEach((s, i) => {
          msg = msg.replace(new RegExp(`\\$${i + 1}`, 'g'), String(s));
        });
        return msg;
      },
    },
  };

  return {
    browser,
    storageData,
    tabs,
    windows,
    groups,
    calls,
    alarms,
    tabMessageHandlers,
    addTab,
    addWindow,
    emitAlarm(name) {
      for (const listener of alarmListeners) listener({ name });
    },
    emitCommand(command) {
      for (const listener of commandListeners) listener(command);
    },
    emitTabActivated(tabId) {
      for (const listener of tabActivatedListeners) listener({ tabId });
    },
    emitTabRemoved(tabId, removeInfo) {
      const idx = tabs.findIndex((t) => t.id === tabId);
      if (idx >= 0) tabs.splice(idx, 1);
      syncWindowTabs(removeInfo && removeInfo.windowId);
      for (const listener of tabRemovedListeners) listener(tabId, removeInfo);
    },
    emitWindowRemoved(windowId) {
      const idx = windows.findIndex((w) => w.id === windowId);
      if (idx >= 0) windows.splice(idx, 1);
      for (const listener of windowRemovedListeners) listener(windowId);
    },
    emitNotificationClicked(id) {
      for (const listener of notificationClickedListeners) listener(id);
    },
    emitInstalled(reason) {
      for (const listener of installedListeners) listener({ reason });
    },
    emitStartup() {
      for (const listener of startupListeners) listener();
    },
  };
}

async function readyBackground(options = {}) {
  const mock = createMockBrowser(options);
  const sandbox = loadBackground(mock.browser);
  await flushPromises(40);
  const launchKind = options.launchKind || 'startup';
  if (launchKind === 'startup') mock.emitStartup();
  else if (launchKind === 'update') mock.emitInstalled('update');
  else if (launchKind === 'install') mock.emitInstalled('install');
  await flushPromises(40);
  return { mock, sandbox };
}

module.exports = {
  ROOT,
  flushPromises,
  flattenI18n,
  loadEnI18n,
  extractHtmlBody,
  createSandbox,
  createDomSandbox,
  loadScriptInto,
  loadPopup,
  loadOptions,
  loadBackground,
  createMockBrowser,
  readyBackground,
};
