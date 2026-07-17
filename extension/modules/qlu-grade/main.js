(async () => {
  'use strict';

  const CORE_KEY = '__DODOKOLU_TOOLBOX_GRADE_CORE__';
  const UI_KEY = '__DODOKOLU_TOOLBOX_GRADE_UI__';
  const EXPECTED_ORIGIN = 'https://jw.qlu.edu.cn';
  const EXPECTED_PATH_PREFIX = '/jwglxt/cjcx/';
  const EXPECTED_GNMKDM = 'N305005';
  const EXPORT_PATH = '/jwglxt/cjcx/cjcx_dcXsKccjList.html';
  const HOST_ID = 'qlu-toolbox-grade-host';

  function deleteTemporaryGlobals() {
    try {
      delete globalThis[CORE_KEY];
    } catch (_error) {
      // The module globals are defined as configurable; this is a final defensive guard.
    }
    try {
      delete globalThis[UI_KEY];
    } catch (_error) {
      // The module globals are defined as configurable; this is a final defensive guard.
    }
  }

  function isSupportedPage() {
    const liveLocation = globalThis.location;
    if (!liveLocation || liveLocation.origin !== EXPECTED_ORIGIN) return false;
    if (typeof liveLocation.pathname !== 'string' || !liveLocation.pathname.startsWith(EXPECTED_PATH_PREFIX)) return false;
    try {
      const search = new URLSearchParams(liveLocation.search || '');
      const values = search.getAll('gnmkdm');
      return values.length === 1 && values[0] === EXPECTED_GNMKDM;
    } catch (_error) {
      return false;
    }
  }

  try {
    if (!isSupportedPage()) return { ok: false, status: 'unsupported-page' };

    const existingHost = document.getElementById(HOST_ID);
    if (existingHost) {
      const open = existingHost.__toolboxOpen;
      if (typeof open === 'function') open.call(existingHost);
      return { ok: true, status: 'already-open' };
    }

    const core = globalThis[CORE_KEY];
    const ui = globalThis[UI_KEY];
    deleteTemporaryGlobals();
    if (!core || !ui || typeof ui.create !== 'function' || typeof core.parseXlsx !== 'function') {
      return { ok: false, status: 'module-unavailable' };
    }

    let latestExcelBuffer = null;
    let latestExportFilename = '成绩单.xlsx';
    let loadVersion = 0;
    let activeAbortController = null;
    let controller = null;

    function clearLatestExport() {
      latestExcelBuffer = null;
      latestExportFilename = '成绩单.xlsx';
      if (controller) controller.clearExportState();
    }

    function invalidateLoad() {
      loadVersion += 1;
      if (activeAbortController) {
        try {
          activeAbortController.abort();
        } catch (_error) {
          // Version invalidation still prevents stale UI updates.
        }
        activeAbortController = null;
      }
    }

    function selectedValueAndText(id) {
      const control = document.getElementById(id);
      if (!control) return { value: '', text: '' };
      const value = core.clean(control.value);
      let text = value;
      const selectedIndex = Number(control.selectedIndex);
      if (control.options && Number.isInteger(selectedIndex) && selectedIndex >= 0 && selectedIndex < control.options.length) {
        const option = control.options[selectedIndex];
        if (option) text = core.clean(option.textContent) || value;
      }
      return { value, text };
    }

    function classifyError(error) {
      const code = error && error.code;
      if (code === 'expired') {
        return {
          state: 'expired',
          title: '登录状态已失效',
          message: '请重新登录教务系统并回到成绩查询页后重试。',
        };
      }
      if (code === 'html-response') {
        return {
          state: 'expired',
          title: '教务系统返回了登录页面',
          message: '当前会话可能已经失效。请重新登录教务系统，再返回成绩查询页重试。',
        };
      }
      if (code === 'non-pk') {
        return {
          state: 'format',
          title: '成绩文件格式异常',
          message: '教务系统没有返回可识别的 Excel 文件，请稍后重新查询。',
        };
      }
      if (code === 'oversized' || code === 'zip-entry-size' || code === 'zip-entry-limit') {
        return {
          state: 'oversized',
          title: '成绩文件过大',
          message: '教务系统返回的数据超过安全解析上限，已停止读取。请缩小学年学期范围后重试。',
        };
      }
      if (code === 'schema' || code === 'xlsx-schema') {
        return {
          state: 'schema',
          title: '成绩表格式有变化',
          message: '教务系统返回了文件，但没有识别到“课程名称 / 成绩 / 成绩分项”字段。',
        };
      }
      if (code === 'empty') {
        return {
          state: 'empty',
          title: '暂时没有成绩分项',
          message: '该学年学期没有可导出的分项成绩，或老师尚未发布。',
        };
      }
      if (code === 'http') {
        return {
          state: 'error',
          title: '教务系统暂时不可用',
          message: '成绩查询请求没有成功，请稍后重新查询。',
        };
      }
      if (
        code === 'zip-structure' ||
        code === 'zip-encrypted' ||
        code === 'zip-compression' ||
        code === 'xlsx-format' ||
        code === 'unsupported-browser'
      ) {
        return {
          state: 'format',
          title: '无法解析成绩文件',
          message: error && error.message ? error.message : '当前成绩文件无法安全解析，请稍后重试。',
        };
      }
      return {
        state: 'network',
        title: '查询没有完成',
        message: '教务系统暂时不可用，或网络连接中断。稍后可直接重新查询。',
      };
    }

    function downloadLatestGrades() {
      if (!(latestExcelBuffer instanceof ArrayBuffer)) return;
      const blob = new Blob([latestExcelBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = latestExportFilename;
      link.hidden = true;
      document.body.append(link);
      link.click();
      link.remove();
      globalThis.setTimeout(function revokeExportUrl() {
        URL.revokeObjectURL(url);
      }, 0);
    }

    async function loadGrades() {
      const currentLoadVersion = loadVersion + 1;
      loadVersion = currentLoadVersion;
      if (activeAbortController) {
        try {
          activeAbortController.abort();
        } catch (_error) {
          // A new version supersedes the old request even if abort is unavailable.
        }
      }
      const abortController = typeof AbortController === 'function' ? new AbortController() : null;
      activeAbortController = abortController;
      clearLatestExport();

      const year = selectedValueAndText('xnm');
      const term = selectedValueAndText('xqm');
      controller.setTerm(year.text, term.text);
      controller.showLoading();

      try {
        const requestOptions = {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          credentials: 'include',
          body: core.buildQueryBody(year.value, term.value),
        };
        if (abortController) requestOptions.signal = abortController.signal;
        const response = await fetch(EXPORT_PATH, requestOptions);
        if (currentLoadVersion !== loadVersion) return;
        if (response.status === 401 || response.status === 403) {
          throw core.makeError('expired', `HTTP ${response.status}`);
        }
        if (!response.ok) throw core.makeError('http', `HTTP ${response.status}`);

        const contentType = core.clean(response.headers.get('content-type')).toLowerCase();
        if (contentType.includes('text/html') || contentType.includes('application/xhtml+xml')) {
          throw core.makeError('html-response', 'The grade endpoint returned HTML');
        }

        const buffer = await core.readResponseArrayBuffer(response, core.constants.MAX_RESPONSE_BYTES);
        if (currentLoadVersion !== loadVersion) return;
        if (core.looksLikeHtml(buffer)) {
          throw core.makeError('html-response', 'The grade endpoint returned HTML');
        }
        if (!core.isPkZip(buffer)) {
          throw core.makeError('non-pk', 'The grade endpoint did not return a PK ZIP file');
        }

        const matrix = await core.parseXlsx(buffer);
        if (currentLoadVersion !== loadVersion) return;
        const header = core.findHeader(matrix);
        if (!header || header.headerIndex < 0) {
          throw core.makeError('schema', 'Expected grade columns were not found');
        }
        const rows = core.extractRows(matrix);
        if (!rows.length) throw core.makeError('empty', 'No grade component rows were returned');
        const groups = core.groupByCourse(rows);
        if (!groups.length) throw core.makeError('empty', 'No grade groups were returned');
        if (currentLoadVersion !== loadVersion) return;

        controller.renderCourses(groups, core.summarizeGpa(groups));
        latestExcelBuffer = buffer;
        latestExportFilename = core.buildExportFilename(year.text, term.text);
        controller.setExportEnabled(true);
      } catch (error) {
        if (currentLoadVersion !== loadVersion) return;
        clearLatestExport();
        console.error('[ToolBox QLU Grade]', error);
        controller.showError(classifyError(error));
      } finally {
        if (currentLoadVersion === loadVersion && activeAbortController === abortController) {
          activeAbortController = null;
        }
      }
    }

    controller = ui.create({
      onRetry: function retryGrades() {
        void loadGrades();
      },
      onExport: downloadLatestGrades,
      onClose: function closeGrades() {
        invalidateLoad();
        clearLatestExport();
      },
    });

    controller.host.__toolboxOpen = function toolboxOpen() {
      const wasClosed = controller.reopen();
      if (wasClosed) void loadGrades();
    };

    void loadGrades();
    return { ok: true, status: 'started' };
  } finally {
    deleteTemporaryGlobals();
  }
})();
