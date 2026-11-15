// The six views in tab order: the list main.js and the tests share (route.js keeps a checked copy of the names).
import * as today from './today.js';
import * as qualify from './qualify.js';
import * as compare from './compare.js';
import * as monitor from './monitor.js';
import * as standards from './standards.js';
import * as evalView from './eval.js';

export const VIEWS = [today, qualify, compare, monitor, standards, evalView];
