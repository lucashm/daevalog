// Pet names and where their souls drop (overlay/data/pets.json, from A2Tools'
// Pet Soul Tracker), and the souls each level takes. As PetData.qml.
import data from '../../../overlay/data/pets.json';

export interface Drop {
  npc: string; region: string; level: number; spawns: number; zones?: string[]; chance?: string;
  kibelisk?: { m: number; name: string; teleport: number } | null;
}
export interface Pet {
  name: string; genus: string; unreleased: boolean; drops: Drop[];
  chests: { name: string; chance: string }[];
  bySide?: { elyos?: Drop[]; asmodian?: Drop[] };
}

export const pets = (data as unknown as { pets: Record<string, Pet> }).pets;
// Souls a pet needs to go from level N to N + 1; level 3 is the top.
export const needed = [5, 25, 75];
export const maxLevel = needed.length;
// Collection status rewards, by pets collected (wikily.gg/aion-2/genus-insight).
export const collectionRewards = [5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200]
  .map(at => ({ at, reward: at % 50 === 0 ? '10 empathy candy' : '100 soul crystals' }));
// Each side's maps; Reshanta and the dungeons belong to both.
export const sideMaps: Record<string, string[]> = { elyos: ['Poeta', 'Verteron', 'Eltnen'], asmodian: ['Ishalgen', 'Altgard', 'Morheim'] };

export const petName = (id: string | number) => pets[id]?.name ?? 'Pet #' + id;
/** Souls still needed to reach level 3. */
export const soulsLeft = (level: number, points: number) => Math.max(0, needed.slice(level).reduce((n, x) => n + x, 0) - points);
