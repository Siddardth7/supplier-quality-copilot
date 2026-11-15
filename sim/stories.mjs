/** SCORECARD's active demo clauses; diagnostics only, never replacement scoring. */
export function storyMisses(id, supplier) {
  const current = supplier.months[17], alerts = supplier.alerts, band = metric => current.metrics[metric].band;
  const has = (type, index, metric) => alerts.some(a => a.type === type && a.index === index && (!metric || a.metric === metric));
  const clauses = {
    'ACT-01': {
      'tier A': current.tier === 'A', 'all metrics good': Object.values(current.metrics).every(m => m.band === 'good'),
      'no alert M7+': !alerts.some(a => a.index >= 7) },
    'ACT-02': {
      'run7 M18': has('run7', 18), 'dppm not bad': band('dppm') !== 'bad',
      'no ucl M7+': !alerts.some(a => a.type === 'ucl' && a.index >= 7),
      'no run7 before M18': !alerts.some(a => a.type === 'run7' && a.index < 18) },
    'ACT-03': {
      'ucl M9': has('ucl', 9), 'no other ucl': !alerts.some(a => a.type === 'ucl' && a.index !== 9),
      'tier A or B': ['A', 'B'].includes(current.tier) },
    'ACT-04': {
      'tier B': current.tier === 'B', 'otd metric_bad M18': has('metric_bad', 18, 'otd'),
      'dppm escape repeat_nc good': ['dppm', 'escape', 'repeat_nc'].every(m => band(m) === 'good'),
      'no ucl or run7': !alerts.some(a => ['ucl', 'run7'].includes(a.type)) },
    'ACT-05': {
      'tier C': current.tier === 'C', 'dppm watch': band('dppm') === 'watch', 'repeat_nc bad': band('repeat_nc') === 'bad',
      'scar_aging bad': band('scar_aging') === 'bad', 'scar_aging alert M18': has('scar_aging', 18) },
    'ACT-06': {
      'tier C or D': ['C', 'D'].includes(current.tier), 'escape metric_bad M18': has('metric_bad', 18, 'escape') },
  }[id];
  return Object.entries(clauses).filter(([, ok]) => !ok).map(([name]) => name);
}
