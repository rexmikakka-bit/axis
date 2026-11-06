// The open fit tabs as the fit pickers' "Open fits" shortcut list wants them: {ship, fit} with the
// saved fit record, not the tab's own {ship, name, id}. Same mapping the phone's Effects and Graph
// tabs do before handing `pinned` to FitPickerSheet — passing the tabs straight through crashed the
// picker the moment a second fit was open (`fit.name` of undefined). `keep(ship, fit)` filters, as
// the command-link picker does with hasCommandBursts.
export function tabFits(openFitTabs, fitsDB, keep) {
  return (openFitTabs ?? [])
    .map(tab => { const fit = fitsDB?.[tab.ship]?.find(f => f.name === tab.name); return fit ? { ship: tab.ship, fit } : null; })
    .filter(x => x && (!keep || keep(x.ship, x.fit)));
}
