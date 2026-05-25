import { useRef, useMemo, useCallback, useState } from 'react';
import { View, Text, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import MapView, { Marker, Callout, Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useLive } from '../../context/LiveContext';
import GeofencePolygon from '../../components/GeofencePolygon';
import type { Geofence } from '../../api/types';

const ZONE_COLORS: Record<string, string> = {
  school: '#3b82f6',
  home: '#22c55e',
  route: '#f59e0b',
};

function geofenceCenter(gf: Geofence): { latitude: number; longitude: number } {
  let latSum = 0, lonSum = 0;
  for (const [lon, lat] of gf.coordinates) {
    latSum += lat;
    lonSum += lon;
  }
  return {
    latitude: latSum / gf.coordinates.length,
    longitude: lonSum / gf.coordinates.length,
  };
}

const INITIAL_REGION: Region = {
  latitude: 43.238,
  longitude: 76.9,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

export default function ClassMapScreen() {
  const mapRef = useRef<MapView>(null);
  const { students, geofences, connected } = useLive();
  const [selectedGeofenceId, setSelectedGeofenceId] = useState<number | null>(null);
  const [showGeoDropdown, setShowGeoDropdown] = useState(false);

  const online = useMemo(
    () => students.filter((s) => {
      if (!s.location) return false;
      const elapsed = Date.now() - new Date(s.location.recorded_at).getTime();
      return elapsed < 5 * 60 * 1000;
    }),
    [students],
  );

  const offline = useMemo(
    () => students.filter((s) => {
      if (!s.location) return true;
      const elapsed = Date.now() - new Date(s.location.recorded_at).getTime();
      return elapsed >= 5 * 60 * 1000;
    }),
    [students],
  );

  const insets = useSafeAreaInsets();

  const centerOnGeofence = useCallback((gf: Geofence) => {
    setSelectedGeofenceId(gf.id);
    const center = geofenceCenter(gf);
    mapRef.current?.animateToRegion(
      {
        latitude: center.latitude,
        longitude: center.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      },
      800,
    );
  }, []);

  const noLocation = useMemo(
    () => students.filter((s) => !s.location),
    [students],
  );

  if (students.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.topbar}>
          <Text style={styles.title}>Карта класса</Text>
          <View style={styles.stats}>
            <Text style={styles.statText}>Нет учеников</Text>
          </View>
        </View>
        <View style={styles.emptyState}>
          <Feather name="map-pin" size={48} color="#94a3b8" />
          <Text style={styles.emptyText}>Нет данных об учениках</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.topbar, { paddingTop: insets.top + 10 }]}>
        <Text style={styles.title}>Карта класса</Text>
        <View style={styles.stats}>
          <View style={[styles.statDot, { backgroundColor: '#22c55e' }]} />
          <Text style={styles.statText}>{online.length} онлайн</Text>
          <View style={[styles.statDot, { backgroundColor: '#94a3b8' }]} />
          <Text style={styles.statText}>{offline.length + noLocation.length} офлайн</Text>
        </View>
      </View>

      <MapView ref={mapRef} style={styles.map} initialRegion={INITIAL_REGION} showsCompass mapPadding={{ top: 50, right: 16, bottom: 0, left: 16 }}>
        {geofences.map((g) => (
          <GeofencePolygon key={g.id} geofence={g} onPress={centerOnGeofence} />
        ))}
        {selectedGeofenceId !== null && (() => {
          const gf = geofences.find(g => g.id === selectedGeofenceId);
          if (!gf) return null;
          const center = geofenceCenter(gf);
          const color = ZONE_COLORS[gf.zone_type] || '#64748b';
          return (
            <Marker
              coordinate={center}
              pinColor={color}
            >
              <Callout>
                <View style={{ padding: 4, minWidth: 120 }}>
                  <Text style={{ fontWeight: '700', fontSize: 14, color: '#0f172a' }}>{gf.name}</Text>
                  <Text style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                    {gf.zone_type === 'school' ? 'Школа' : gf.zone_type === 'home' ? 'Дом' : 'Маршрут'}
                  </Text>
                  <Text style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Точек: {gf.coordinates.length}</Text>
                </View>
              </Callout>
            </Marker>
          );
        })()}
        {students.map(({ student, location }) => {
          if (!location) return null;
          const isOnline =
            Date.now() - new Date(location.recorded_at).getTime() < 5 * 60 * 1000;
          return (
            <Marker
              key={student.id}
              coordinate={{ latitude: location.lat, longitude: location.lon }}
              pinColor={isOnline ? '#22c55e' : '#94a3b8'}
              title={student.full_name}
              description={`Класс ${student.class_name} • Заряд: ${location.battery ?? '—'}%`}
            />
          );
        })}
      </MapView>

      <View style={styles.bottomCard}>
        <TouchableOpacity
          style={styles.geoDropdownToggle}
          onPress={() => setShowGeoDropdown(prev => !prev)}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Feather name="map-pin" size={16} color="#1e3a8a" />
            <Text style={styles.geoDropdownText}>
              {selectedGeofenceId === null
                ? 'Все геозоны'
                : geofences.find(g => g.id === selectedGeofenceId)?.name || 'Геозона'}
            </Text>
          </View>
          <Feather name={showGeoDropdown ? 'chevron-up' : 'chevron-down'} size={16} color="#64748b" />
        </TouchableOpacity>

        {showGeoDropdown && geofences.length > 0 && (
          <View style={styles.geoDropdownList}>
            <TouchableOpacity
              style={[styles.geoDropdownItem, selectedGeofenceId === null && styles.geoDropdownItemActive]}
              onPress={() => {
                setSelectedGeofenceId(null);
                setShowGeoDropdown(false);
                mapRef.current?.animateToRegion(INITIAL_REGION, 800);
              }}
            >
              <Text style={[styles.geoDropdownItemText, selectedGeofenceId === null && styles.geoDropdownItemTextActive]}>Все геозоны</Text>
            </TouchableOpacity>
            {geofences.map((g) => {
              const isActive = selectedGeofenceId === g.id;
              const color = ZONE_COLORS[g.zone_type] || '#64748b';
              return (
                <TouchableOpacity
                  key={g.id}
                  style={[styles.geoDropdownItem, isActive && styles.geoDropdownItemActive]}
                  onPress={() => {
                    setSelectedGeofenceId(g.id);
                    setShowGeoDropdown(false);
                    centerOnGeofence(g);
                  }}
                >
                  <View style={[styles.geoDropdownDot, { backgroundColor: color }]} />
                  <Text style={[styles.geoDropdownItemText, isActive && styles.geoDropdownItemTextActive]}>
                    {g.name}
                  </Text>
                  <Text style={styles.geoDropdownItemType}>
                    {g.zone_type === 'school' ? 'Школа' : g.zone_type === 'home' ? 'Дом' : 'Маршрут'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <View style={{ borderTopWidth: 1, borderTopColor: '#e2e8f0', marginTop: 8, paddingTop: 8 }}>
          <Text style={styles.legendTitle}>Ученики ({students.length})</Text>
          {students.slice(0, 20).map(({ student, location }) => {
            const isOnline = location
              ? Date.now() - new Date(location.recorded_at).getTime() < 5 * 60 * 1000
              : false;
            return (
              <View key={student.id} style={styles.legendRow}>
                <View style={[styles.legendDot, { backgroundColor: isOnline ? '#22c55e' : '#94a3b8' }]} />
                <Text style={styles.legendName}>{student.full_name}</Text>
                <Text style={styles.legendClass}>{student.class_name}</Text>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  topbar: {
    paddingHorizontal: 16,
    
    paddingBottom: 12,
    backgroundColor: '#1e3a8a',
  },
  title: { color: 'white', fontSize: 18, fontWeight: '700' },
  stats: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  statDot: { width: 8, height: 8, borderRadius: 4 },
  statText: { color: '#93c5fd', fontSize: 13 },
  map: { flex: 1 },
  bottomCard: {
    backgroundColor: 'white',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
    maxHeight: 300,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  geoDropdownToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    padding: 10,
  },
  geoDropdownText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
  },
  geoDropdownList: {
    marginTop: 6,
    backgroundColor: 'white',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    maxHeight: 180,
  },
  geoDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  geoDropdownItemActive: {
    backgroundColor: '#eef2ff',
  },
  geoDropdownDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  geoDropdownItemText: {
    fontSize: 14,
    color: '#334155',
    flex: 1,
  },
  geoDropdownItemTextActive: {
    fontWeight: '700',
    color: '#1e3a8a',
  },
  geoDropdownItemType: {
    fontSize: 11,
    color: '#94a3b8',
    marginLeft: 8,
  },
  legendTitle: { fontSize: 14, fontWeight: '600', color: '#0f172a', marginBottom: 8 },
  legendRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 3 },
  legendDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  legendName: { fontSize: 13, color: '#0f172a', flex: 1 },
  legendClass: { fontSize: 12, color: '#94a3b8' },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 14, color: '#94a3b8' },
});
