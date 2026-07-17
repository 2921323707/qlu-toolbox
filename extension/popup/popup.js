import { MODULES } from '../core/module-registry.js';
import {
  ELIGIBILITY_REASONS,
  evaluateUrlEligibility,
  isRestrictedEligibilityReason,
} from '../core/url-match.js';

const RUN_MESSAGE_TYPE = 'toolbox.run-module';
const moduleList = document.querySelector('#module-list');
const pageNotice = document.querySelector('#page-notice');
const pageNoticeText = document.querySelector('#page-notice-text');
const cards = new Map();
let observedTab = null;

const stateCopy = Object.freeze({
  checking: Object.freeze({ message: '正在确认当前页面…', button: '请稍候', disabled: true }),
  ready: Object.freeze({ message: '页面与登录状态将由教务系统提供。', button: '查看分项', disabled: false }),
  unsupported: Object.freeze({ message: '请先进入教务系统的学生成绩查询页。', button: '等待进入', disabled: true }),
  restricted: Object.freeze({ message: '浏览器内部页面不能直接运行工具。', button: '等待进入', disabled: true }),
  running: Object.freeze({ message: '正在当前页面打开成绩面板…', button: '启动中', disabled: true }),
  started: Object.freeze({ message: '成绩面板已打开。', button: '已启动', disabled: true }),
  'already-open': Object.freeze({ message: '成绩面板已经在页面中。', button: '已打开', disabled: true }),
  error: Object.freeze({ message: '启动没有完成，可以再试一次。', button: '重试', disabled: false }),
});

function createCard(module) {
  const item = document.createElement('li');
  const article = document.createElement('article');
  const topLine = document.createElement('div');
  const glyph = document.createElement('span');
  const copy = document.createElement('div');
  const kicker = document.createElement('div');
  const category = document.createElement('span');
  const title = document.createElement('h3');
  const description = document.createElement('p');
  const dot = document.createElement('span');
  const actions = document.createElement('div');
  const status = document.createElement('p');
  const button = document.createElement('button');

  article.className = 'module-card';
  article.dataset.moduleId = module.id;
  topLine.className = 'card-topline';
  glyph.className = 'module-glyph';
  glyph.setAttribute('aria-hidden', 'true');
  kicker.className = 'card-kicker';
  category.textContent = 'ACADEMIC / LIVE';
  title.className = 'module-title';
  title.textContent = module.label;
  description.className = 'module-description';
  description.textContent = module.description;
  dot.className = 'state-dot';
  dot.setAttribute('aria-hidden', 'true');
  actions.className = 'card-actions';
  status.className = 'module-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  button.className = 'run-button';
  button.type = 'button';
  button.addEventListener('click', () => runModule(module));

  kicker.append(category);
  copy.append(kicker, title, description);
  topLine.append(glyph, copy, dot);
  actions.append(status, button);
  article.append(topLine, actions);
  item.append(article);
  moduleList.append(item);

  const card = { article, status, button };
  cards.set(module.id, card);
  applyState(card, 'checking');
}

function applyState(card, state, message) {
  const copy = stateCopy[state] || stateCopy.error;
  card.article.dataset.state = state in stateCopy ? state : 'error';
  card.status.textContent = message || copy.message;
  card.button.textContent = copy.button;
  card.button.disabled = copy.disabled;
}

function unsupportedMessage(reason) {
  if (reason === ELIGIBILITY_REASONS.PATH_MISMATCH || reason === ELIGIBILITY_REASONS.QUERY_MISMATCH) {
    return '教务系统已打开，请进入“学生成绩查询”。';
  }
  return '此工具仅在齐鲁工业大学成绩查询页运行。';
}

function setNotice(mode, message) {
  pageNotice.dataset.mode = mode;
  pageNoticeText.textContent = message;
}

function updateNotice(eligibility) {
  if (eligibility.eligible) {
    setNotice('ready', '已识别成绩查询页，可以使用下方工具。');
    return;
  }

  if (isRestrictedEligibilityReason(eligibility.reason)) {
    setNotice('restricted', '请先在普通标签页打开教务系统的学生成绩查询页。');
    return;
  }

  if (eligibility.reason === ELIGIBILITY_REASONS.PATH_MISMATCH || eligibility.reason === ELIGIBILITY_REASONS.QUERY_MISMATCH) {
    setNotice('unsupported', '当前不是成绩查询页，请在教务系统中进入“学生成绩查询”。');
    return;
  }

  setNotice('unsupported', '请先打开齐鲁工业大学教务系统的学生成绩查询页。');
}

function updateEligibility(module, rawUrl) {
  const card = cards.get(module.id);
  const eligibility = evaluateUrlEligibility(module, rawUrl);

  if (eligibility.eligible) {
    applyState(card, 'ready');
  } else if (isRestrictedEligibilityReason(eligibility.reason)) {
    applyState(card, 'restricted');
  } else {
    applyState(card, 'unsupported', unsupportedMessage(eligibility.reason));
  }
  return eligibility;
}

function workerErrorMessage(code) {
  switch (code) {
    case 'tab-changed':
    case 'tab-unavailable':
      return '当前标签页已变化，请重新打开 ToolBox。';
    case 'not-eligible':
      return '页面地址已变化，请先回到成绩查询页。';
    case 'restricted-page':
      return '浏览器不允许在这个页面打开成绩面板。';
    case 'module-failed':
      return '成绩模块启动时遇到问题，请重试。';
    default:
      return '启动没有完成，请稍后重试。';
  }
}

async function runModule(module) {
  const card = cards.get(module.id);
  if (!observedTab || !Number.isInteger(observedTab.id)) {
    applyState(card, 'error', '无法读取当前标签页，请重试。');
    return;
  }

  applyState(card, 'running');

  try {
    const response = await chrome.runtime.sendMessage({
      type: RUN_MESSAGE_TYPE,
      moduleId: module.id,
      observedTabId: observedTab.id,
    });

    if (response && response.ok && (response.status === 'started' || response.status === 'already-open')) {
      applyState(card, response.status);
      globalThis.setTimeout(() => globalThis.close(), 260);
      return;
    }

    if (response && response.code === 'not-eligible') {
      if (isRestrictedEligibilityReason(response.reason)) {
        applyState(card, 'restricted');
      } else {
        applyState(card, 'unsupported', workerErrorMessage(response.code));
      }
      return;
    }

    applyState(card, 'error', workerErrorMessage(response && response.code));
  } catch {
    applyState(card, 'error');
  }
}

async function initialize() {
  for (const module of MODULES) createCard(module);
  moduleList.setAttribute('aria-busy', 'false');

  try {
    const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
    observedTab = activeTabs[0] || null;
  } catch {
    observedTab = null;
  }

  let primaryEligibility = null;
  for (const module of MODULES) {
    const eligibility = updateEligibility(module, observedTab && observedTab.url);
    if (!primaryEligibility) primaryEligibility = eligibility;
  }
  updateNotice(primaryEligibility || { eligible: false, reason: ELIGIBILITY_REASONS.INVALID_URL });
  document.body.dataset.ready = 'true';
}

initialize();
