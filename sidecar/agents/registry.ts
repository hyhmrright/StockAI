import type { MasterAgent } from './types';
import { DEFAULT_SELECTED_MASTERS } from '../../shared/constants';
import { agent as warrenBuffett } from './masters/warren-buffett';
import { agent as benGraham } from './masters/ben-graham';
import { agent as charlieMunger } from './masters/charlie-munger';
import { agent as michaelBurry } from './masters/michael-burry';
import { agent as cathieWood } from './masters/cathie-wood';
import { agent as peterLynch } from './masters/peter-lynch';
import { agent as philFisher } from './masters/phil-fisher';
import { agent as billAckman } from './masters/bill-ackman';
import { agent as mohnishPabrai } from './masters/mohnish-pabrai';
import { agent as nassimTaleb } from './masters/nassim-taleb';
import { agent as stanleyDruckenmiller } from './masters/stanley-druckenmiller';
import { agent as aswathDamodaran } from './masters/aswath-damodaran';
import { agent as rakeshJhunjhunwala } from './masters/rakesh-jhunjhunwala';

const REGISTRY: Map<string, MasterAgent> = new Map([
  [warrenBuffett.meta.id, warrenBuffett],
  [benGraham.meta.id, benGraham],
  [charlieMunger.meta.id, charlieMunger],
  [michaelBurry.meta.id, michaelBurry],
  [cathieWood.meta.id, cathieWood],
  [peterLynch.meta.id, peterLynch],
  [philFisher.meta.id, philFisher],
  [billAckman.meta.id, billAckman],
  [mohnishPabrai.meta.id, mohnishPabrai],
  [nassimTaleb.meta.id, nassimTaleb],
  [stanleyDruckenmiller.meta.id, stanleyDruckenmiller],
  [aswathDamodaran.meta.id, aswathDamodaran],
  [rakeshJhunjhunwala.meta.id, rakeshJhunjhunwala],
]);

export const DEFAULT_MASTER_IDS = DEFAULT_SELECTED_MASTERS;

export function getMaster(id: string): MasterAgent | undefined {
  return REGISTRY.get(id);
}
export function getAllMasters(): MasterAgent[] {
  return [...REGISTRY.values()];
}
export function getSelectedMasters(ids: string[]): MasterAgent[] {
  return ids.map((id) => REGISTRY.get(id)).filter((a): a is MasterAgent => a != null);
}
