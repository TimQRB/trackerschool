import { Polyline } from 'react-native-maps';
import type { LocationPoint } from '../api/types';

interface Props {
  track: LocationPoint[];
  isSelected: boolean;
}

export default function RoutePolyline({ track, isSelected }: Props) {
  if (track.length < 2) return null;

  const coords = track.map((p) => ({
    latitude: p.lat,
    longitude: p.lon,
  }));

  const color = isSelected ? '#6366f1' : '#6366f150';

  return (
    <Polyline
      coordinates={coords}
      strokeColor={color}
      strokeWidth={2}
      lineDashPattern={isSelected ? [4, 6] : [4, 12]}
    />
  );
}
