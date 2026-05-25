import { Polygon } from 'react-native-maps';
import type { Geofence } from '../api/types';

export const ZONE_COLORS: Record<string, string> = {
  school: '#3b82f6',
  home: '#22c55e',
  route: '#f59e0b',
};

interface Props {
  geofence: Geofence;
  onPress?: (geofence: Geofence) => void;
}

export default function GeofencePolygon({ geofence, onPress }: Props) {
  const color = ZONE_COLORS[geofence.zone_type] || '#64748b';

  const coords = geofence.coordinates.map(([lon, lat]) => ({
    latitude: lat,
    longitude: lon,
  }));

  return (
    <Polygon
      coordinates={coords}
      fillColor={color + '26'}
      strokeColor={color}
      strokeWidth={2}
      tappable
      onPress={() => onPress?.(geofence)}
    />
  );
}
