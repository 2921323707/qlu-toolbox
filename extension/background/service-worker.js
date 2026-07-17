import { getModuleById } from '../core/module-registry.js';
import { evaluateUrlEligibility } from '../core/url-match.js';

const RUN_MESSAGE_TYPE = 'toolbox.run-module';
const SUCCESS_STATUSES = new Set(['started', 'already-open']);

function failure(code, details = {}) {
  return { ok: false, status: 'error', code, ...details };
}

function mapChromeError(error) {
  const message = error instanceof Error ? error.message : String(error || '');

  if (
    /Cannot access|not allowed on|extensions gallery|chrome:\/\/|edge:\/\/|Missing host permission/i.test(message)
  ) {
    return 'restricted-page';
  }

  if (/No tab with id|Frame with ID 0|frame was removed|tab was closed/i.test(message)) {
    return 'tab-unavailable';
  }

  return 'injection-failed';
}

function interpretModuleResult(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return failure('invalid-module-result');
  }

  if (value.ok === true && SUCCESS_STATUSES.has(value.status)) {
    return { ok: true, status: value.status };
  }

  if (value.status === 'unsupported-page') {
    return failure('not-eligible', { reason: 'page-changed' });
  }

  if (value.status === 'module-unavailable') {
    return failure('module-failed');
  }

  return failure(value.ok === false ? 'module-failed' : 'invalid-module-result');
}

async function runModule(message, sender) {
  if (!sender || sender.id !== chrome.runtime.id) {
    return failure('invalid-sender');
  }

  if (!message || typeof message !== 'object' || message.type !== RUN_MESSAGE_TYPE) {
    return failure('invalid-request');
  }

  const module = getModuleById(message.moduleId);
  if (!module) return failure('unknown-module');

  if (!Number.isInteger(message.observedTabId) || message.observedTabId < 0) {
    return failure('invalid-tab');
  }

  let activeTabs;
  try {
    activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch {
    return failure('tab-query-failed');
  }

  const activeTab = activeTabs[0];
  if (!activeTab || activeTab.id !== message.observedTabId) {
    return failure('tab-changed');
  }

  const eligibility = evaluateUrlEligibility(module, activeTab.url);
  if (!eligibility.eligible) {
    return failure('not-eligible', { reason: eligibility.reason });
  }

  try {
    const injectionResults = await chrome.scripting.executeScript({
      target: {
        tabId: activeTab.id,
        frameIds: [0],
      },
      world: module.world,
      files: module.files,
    });
    const lastInjection = injectionResults[injectionResults.length - 1];
    return interpretModuleResult(lastInjection && lastInjection.result);
  } catch (error) {
    return failure(mapChromeError(error));
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  runModule(message, sender).then(
    sendResponse,
    () => sendResponse(failure('internal-error')),
  );
  return true;
});
