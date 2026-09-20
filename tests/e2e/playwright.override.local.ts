import base from './playwright.config.ts';
const projects = (base.projects ?? []).map((project) => ({
  ...project,
  use: { ...project.use, launchOptions: { executablePath: '/opt/pw-browsers/chromium' } },
}));
export default { ...base, projects };
