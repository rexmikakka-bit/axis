#!/usr/bin/env node
// gen_fractured_skies.mjs — fit specs exercising everything Fractured Skies (24.02) added, for the
// oracle: every Synchronizer faction with its faction modules (one offline, where it matters), the
// navy attack battlecruisers, the 'Vigilant' Vital modules active and online, the Xyston rigging
// implant, a SARO booster, and the Hawk/Cerberus missile changes.
//
//     node scripts/oracle/gen_fractured_skies.mjs > scripts/oracle/_fs.jsonl
//     /c/Python314/python scripts/oracle/oracle_batch.py scripts/oracle/_fs.jsonl > scripts/oracle/_fs_out.jsonl
//     node scripts/oracle/oracle_compare.mjs scripts/oracle/_fs_out.jsonl
//
// Hand-written fits, not generated combinations: each one is built to make one rig's or hull's
// bonuses show in a stat the oracle compares (DPS, EHP, speed, lock range, cap).
import { tidByName } from '../../src/calc.js';

const m = (name, state = 'active', ammo) => {
  const typeID = tidByName(name);
  if (!typeID) throw new Error(`unknown type: ${name}`);
  return { typeID, name, state, ...(ammo ? { ammo } : {}) };
};
const n = (k, name, state, ammo) => Array.from({ length: k }, () => m(name, state, ammo));
const fit = (id, ship, slots, extra = {}) => ({
  id, name: id, ship,
  spec: { ship: { typeID: tidByName(ship), name: ship }, slots: { high: [], mid: [], low: [], rigs: [], ...slots },
    drones: extra.drones ?? [], implants: extra.implants ?? [], boosters: extra.boosters ?? [] },
});

const FITS = [
  // Dark Blood: neut + lasers, two heat sinks (one offline: CCP's marker is passive, so it counts).
  fit('sync-darkblood', 'Omen', { high: [...n(4, 'Heavy Pulse Laser II', 'active', 'Multifrequency M'), m('Heavy Energy Neutralizer II')],
    low: n(2, 'Dark Blood Heat Sink', 'online'), rigs: [m('Medium Dark Blood Synchronizer', 'online')] }),
  fit('sync-darkblood-offline', 'Omen', { high: n(4, 'Heavy Pulse Laser II', 'active', 'Multifrequency M'),
    low: [m('Dark Blood Heat Sink', 'online'), m('Dark Blood Heat Sink', 'offline')], rigs: [m('Medium Dark Blood Synchronizer', 'online')] }),
  fit('sync-darkblood-none', 'Omen', { high: n(4, 'Heavy Pulse Laser II', 'active', 'Multifrequency M'),
    low: n(2, 'Heat Sink II', 'online'), rigs: [m('Medium Dark Blood Synchronizer', 'online')] }),
  fit('sync-domination', 'Hurricane', { high: n(6, '425mm AutoCannon II', 'active', 'Republic Fleet EMP M'),
    low: n(2, 'Domination Gyrostabilizer', 'online'), rigs: [m('Medium Domination Synchronizer', 'online')] }),
  fit('sync-guristas', 'Vexor', { mid: [m('Dread Guristas Multispectral ECM')], rigs: [m('Medium Dread Guristas Synchronizer', 'online')] },
    { drones: [{ name: 'Hammerhead II', qty: 5, active: true }] }),
  fit('sync-serpentis', 'Thorax', { high: n(5, 'Heavy Neutron Blaster II', 'active', 'Void M'), mid: [m('Shadow Serpentis Stasis Webifier')],
    low: [m('Magnetic Field Stabilizer II', 'online')], rigs: [m('Medium Shadow Serpentis Synchronizer', 'online')] }),
  fit('sync-sansha', 'Omen', { high: n(4, 'Heavy Pulse Laser II', 'active', 'Multifrequency M'), mid: [m('10MN Afterburner II')],
    low: [m('True Sansha Heat Sink', 'online')], rigs: [m('Medium True Sansha Synchronizer', 'online')] }),
  fit('sync-republic', 'Maelstrom', { high: n(8, '1400mm Howitzer Artillery II', 'active', 'Republic Fleet EMP L'), mid: [m('Large Shield Booster II')],
    low: n(2, 'Republic Fleet Gyrostabilizer', 'online'), rigs: [m('Large Republic Fleet Synchronizer', 'online')] }),
  fit('sync-federation', 'Megathron', { high: n(7, 'Neutron Blaster Cannon II', 'active', 'Void L'),
    low: [...n(2, 'Federation Navy Magnetic Field Stabilizer', 'online'), m('Large Armor Repairer II')], rigs: [m('Large Federation Navy Synchronizer', 'online')] }),
  fit('sync-caldari', 'Raven', { high: n(6, 'Cruise Missile Launcher II', 'active', 'Scourge Cruise Missile'),
    low: n(2, 'Caldari Navy Ballistic Control System', 'online'), rigs: [m('Large Caldari Navy Synchronizer', 'online')] }),
  fit('sync-imperial', 'Apocalypse', { high: n(8, 'Mega Pulse Laser II', 'active', 'Multifrequency L'), mid: [m('Imperial Navy Stasis Webifier')],
    low: n(2, 'Imperial Navy Heat Sink', 'online'), rigs: [m('Large Imperial Navy Synchronizer', 'online')] }),
  fit('sync-imperial-xyston', 'Apocalypse', { high: n(8, 'Mega Pulse Laser II', 'active', 'Multifrequency L'),
    low: n(2, 'Imperial Navy Heat Sink', 'online'), rigs: [m('Large Imperial Navy Synchronizer', 'online')] },
    { implants: [{ name: "Vigilant Tyrannos 'Xyston' Synchronization Rigging SY-1020" }] }),
  // The navy attack battlecruisers.
  fit('abc-oracle-ni', 'Oracle Navy Issue', { high: n(6, 'Mega Pulse Laser II', 'active', 'Multifrequency L'), low: n(2, 'Heat Sink II', 'online') }),
  fit('abc-talos-ni', 'Talos Navy Issue', { high: n(6, 'Neutron Blaster Cannon II', 'active', 'Void L'), mid: [m('50MN Microwarpdrive II')] }),
  fit('abc-naga-ni', 'Naga Navy Issue', { high: n(6, 'Torpedo Launcher II', 'active', 'Scourge Torpedo'), low: n(2, 'Ballistic Control System II', 'online') }),
  fit('abc-tornado-fi', 'Tornado Fleet Issue', { high: n(6, '1400mm Howitzer Artillery II', 'active', 'Republic Fleet EMP L'), mid: [m('50MN Microwarpdrive II')] }),
  // 'Vigilant' Vital (Aberrant) modules.
  fit('aberrant-overdrive-active', 'Rifter', { low: [m("'Vigilant' Vital Overdrive Injector System", 'active')] }),
  fit('aberrant-overdrive-online', 'Rifter', { low: [m("'Vigilant' Vital Overdrive Injector System", 'online')] }),
  fit('aberrant-sba-active', 'Rifter', { mid: [m('Small Shield Booster II'), m("'Vigilant' Vital Shield Boost Amplifier", 'active')] }),
  fit('aberrant-caprech-active', 'Rifter', { mid: [m("'Vigilant' Vital Cap Recharger", 'active')] }),
  // SARO booster, and the missile hulls 24.02 changed.
  fit('saro-enforcement', 'Rifter', { high: n(3, '200mm AutoCannon II', 'active', 'EMP S') }, { boosters: [{ name: 'SARO Enforcement Booster' }] }),
  fit('hawk-rockets', 'Hawk', { high: n(4, 'Rocket Launcher II', 'active', 'Mjolnir Rocket') }),
  fit('cerberus-ham', 'Cerberus', { high: n(5, 'Heavy Assault Missile Launcher II', 'active', 'Scourge Heavy Assault Missile') }),
];
for (const f of FITS) process.stdout.write(JSON.stringify(f) + '\n');
console.error(`${FITS.length} Fractured Skies fits`);
