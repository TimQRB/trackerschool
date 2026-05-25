import { useRef, useCallback, useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import MapView, { Marker, Callout, Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useLive } from '../../context/LiveContext';
import { api } from '../../api/client';
import StudentMarker from '../../components/StudentMarker';
import GeofencePolygon from '../../components/GeofencePolygon';
import RoutePolyline from '../../components/RoutePolyline';
import type { Geofence } from '../../api/types';

const INITIAL_REGION: Region = {
  latitude: 43.238,
  longitude: 76.9,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

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

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const { students, geofences, selectedStudentId, setSelectedStudentId } = useLive();
  const [locating, setLocating] = useState<number | null>(null);
  const [selectedGeofenceId, setSelectedGeofenceId] = useState<number | null>(null);
  const [showGeoDropdown, setShowGeoDropdown] = useState(false);

  const selectedStudent = students.find((s) => s.student.id === selectedStudentId);

  const centerOnStudent = useCallback(() => {
    setSelectedGeofenceId(null);
    const s = selectedStudent || students[0];
    if (s?.location) {
      mapRef.current?.animateToRegion(
        {
          latitude: s.location.lat,
          longitude: s.location.lon,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        },
        800,
      );
    }
  }, [selectedStudent, students]);

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

  const handleLocateNow = async () => {
    const s = selectedStudent || students[0];
    if (!s?.student.device) return;
    setLocating(s.student.id);
    try {
      const res = await api.post(`/api/devices/${s.student.device.id}/locate-now`);
      if (!res.data.ok) {
        alert(res.data.reason || 'Устройство не на связи');
      }
    } catch (e: any) {
      alert('Ошибка: ' + (e.message || 'неизвестная'));
    } finally {
      setLocating(null);
    }
  };

  useEffect(() => {
    if (selectedStudent?.location && mapRef.current) {
      setSelectedGeofenceId(null);
      mapRef.current.animateToRegion(
        {
          latitude: selectedStudent.location.lat,
          longitude: selectedStudent.location.lon,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        },
        800,
      );
    }
  }, [selectedStudent?.location?.lat, selectedStudent?.location?.lon]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={INITIAL_REGION}
        showsUserLocation={false}
        showsCompass
        mapPadding={{ top: 50, right: 16, bottom: 0, left: 16 }}
      >
        {geofences.map((g) => (
          <GeofencePolygon key={g.id} geofence={g} onPress={centerOnGeofence} />
        ))}
        {selectedGeofenceId !== null && (() => {
          const gf = geofences.find(g => g.id === selectedGeofenceId);
          if (!gf) return null;
          const center = geofenceCenter(gf);
          const color = ZONE_COLORS[gf.zone_type] || '#64748b';
          return (
            <Marker coordinate={center} pinColor={color}>
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

        {students.map(({ student, location, track }) => (
          <View key={student.id}>
            {track.length > 1 && (
              <RoutePolyline
                track={track}
                isSelected={selectedStudentId === student.id}
              />
            )}
            {location && (
              <StudentMarker
                student={student}
                point={location}
                isSelected={selectedStudentId === student.id}
                onPress={() => setSelectedStudentId(student.id)}
              />
            )}
          </View>
        ))}
      </MapView>

      <View style={[styles.bottomCard, { paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
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
                  <View style={[styles.geoDropdownItemDot, { backgroundColor: color }]} />
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
          {selectedGeofenceId !== null ? (
            (() => {
              const gf = geofences.find((g) => g.id === selectedGeofenceId);
              if (!gf) return null;
              return (
                <>
                  <Text style={styles.name}>{gf.name}</Text>
                  <Text style={styles.meta}>
                    Тип: {gf.zone_type === 'school' ? 'Школа' : gf.zone_type === 'home' ? 'Дом' : 'Маршрут'}
                  </Text>
                  <Text style={styles.meta}>Точек: {gf.coordinates.length}</Text>
                </>
              );
            })()
          ) : selectedStudent ? (
            <>
              <Text style={styles.name}>{selectedStudent.student.full_name}</Text>
              <Text style={styles.meta}>
                Класс {selectedStudent.student.class_name}
                {selectedStudent.location
                  ? ` • Заряд: ${selectedStudent.location.battery ?? '—'}%`
                  : ''}
              </Text>
              <Text style={styles.meta}>
                {selectedStudent.location
                  ? `Обновлено: ${new Date(selectedStudent.location.recorded_at).toLocaleTimeString()}`
                  : 'Нет данных о местоположении'}
              </Text>
              <View style={styles.actions}>
                <TouchableOpacity style={styles.btn} onPress={centerOnStudent}>
                  <Feather name="map-pin" size={14} color="white" />
                  <Text style={styles.btnText}> Центрировать</Text>
                </TouchableOpacity>
                {selectedStudent.student.device && (
                  <TouchableOpacity
                    style={[styles.btn, locating ? styles.btnDisabled : null]}
                    onPress={handleLocateNow}
                    disabled={locating !== null}
                  >
                    {locating === selectedStudent.student.id ? (
                      <ActivityIndicator size="small" color="white" />
                    ) : (
                      <>
                        <Feather name="wifi" size={14} color="white" />
                        <Text style={styles.btnText}> Найти сейчас</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            </>
          ) : (
            <Text style={styles.empty}>Нет учеников</Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  bottomCard: {
    backgroundColor: 'white',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
    maxHeight: 300,
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
  geoDropdownItemDot: {
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
  name: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  meta: { fontSize: 13, color: '#64748b', marginTop: 2 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  btn: {
    flex: 1,
    backgroundColor: '#1e3a8a',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: 'white', fontSize: 13, fontWeight: '600' },
  empty: { fontSize: 14, color: '#94a3b8', textAlign: 'center', padding: 20 },
});
