import { moduleDependencyValue } from './module-dep.js';

window.__sandboxCompatModuleImport = moduleDependencyValue;
window.dispatchEvent(new CustomEvent('sandbox-compat:module-import'));
