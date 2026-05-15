import { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  StyleSheet,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLive } from '../../context/LiveContext';
import EventCard from '../../components/EventCard';

type FilterType = 'all' | 'sos' | 'zone' | 'battery';

const FILTERS: { key: FilterType; label: string }[] = [
  { key: 'all', label: 'Все' },
  { key: 'sos', label: 'SOS' },
  { key: 'zone', label: 'Геозоны' },
  { key: 'battery', label: 'Батарея' },
];

export default function EventsScreen() {
  const insets = useSafeAreaInsets();
  const { events, loadInitialData } = useLive();
  const [filter, setFilter] = useState<FilterType>('all');
  const [refreshing, setRefreshing] = useState(false);

  const filtered = useMemo(() => {
    switch (filter) {
      case 'sos':
        return events.filter((e) => e.event_type === 'sos');
      case 'zone':
        return events.filter((e) => e.event_type === 'enter_zone' || e.event_type === 'exit_zone');
      case 'battery':
        return events.filter((e) => e.event_type === 'low_battery');
      default:
        return events;
    }
  }, [events, filter]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadInitialData();
    setRefreshing(false);
  }, [loadInitialData]);

  const handleEventPress = (event: any) => {
    if (event.event_type === 'sos') {
      const phone = ''; // no direct phone from event — user can call from contacts screen
      if (event.lat && event.lon) {
        Linking.openURL(`https://maps.google.com/maps?q=${event.lat},${event.lon}`);
      }
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.topbar, { paddingTop: insets.top + 10 }]}>
        <Text style={styles.title}>События</Text>
      </View>

      <View style={styles.filters}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterBtn, filter === f.key && styles.filterBtnActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {filtered.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Нет событий</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <EventCard event={item} onPress={() => handleEventPress(item)} />
          )}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          contentContainerStyle={styles.list}
        />
      )}
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
  filters: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  filterBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#e2e8f0',
  },
  filterBtnActive: { backgroundColor: '#1e3a8a' },
  filterText: { fontSize: 13, color: '#475569', fontWeight: '500' },
  filterTextActive: { color: 'white' },
  list: { padding: 16, paddingTop: 0 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 14, color: '#94a3b8' },
});
