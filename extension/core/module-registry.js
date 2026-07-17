const qluGradeModule = Object.freeze({
  id: 'qlu-grade',
  label: '成绩分项查询',
  description: '读取当前学期的成绩分项、加权 GPA 与原始 Excel。',
  matches: Object.freeze({
    origin: 'https://jw.qlu.edu.cn',
    pathPrefix: '/jwglxt/cjcx/',
    query: Object.freeze({
      gnmkdm: 'N305005',
    }),
  }),
  world: 'MAIN',
  files: Object.freeze([
    'modules/qlu-grade/grade-core.js',
    'modules/qlu-grade/grade-ui.js',
    'modules/qlu-grade/main.js',
  ]),
  runBehavior: 'singleton',
});

export const MODULES = Object.freeze([qluGradeModule]);

const moduleById = new Map(MODULES.map((module) => [module.id, module]));

export function getModules() {
  return MODULES;
}

export function getModuleById(moduleId) {
  return typeof moduleId === 'string' ? moduleById.get(moduleId) || null : null;
}

export function hasModule(moduleId) {
  return getModuleById(moduleId) !== null;
}
