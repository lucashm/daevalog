// The pets' portraits: they come with the map data (MapData.qml), fetched the first time they're needed.
import { useMapData } from './mapData';

export function usePortraits(): Record<string, string> {
  return useMapData().portraits;
}
