import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { TrackEvent } from '../api/types';

const EVENT_ICONS: Record<string, { name: string; color: string }> = {
  enter_zone: { name: 'download', color: '#3b82f6' },
  exit_zone: { name: 'upload', color: '#f59e0b' },
  sos: { name: 'alert-octagon', color: '#ef4444' },
  low_battery: { name: 'battery-charging', color: '#ef4444' },
  lost_signal: { name: 'wifi-off', color: '#64748b' },
  power_on: { name: 'power', color: '#22c55e' },
  power_off: { name: 'power', color: '#dc2626' },
};

const EVENT_LABELS: Record<string, string> = {
  enter_zone: 'Вход в зону',
  exit_zone: 'Выход из зоны',
  sos: 'SOS',
  low_battery: 'Низкий заряд',
  lost_signal: 'Потеря связи',
  power_on: 'Устройство включено',
  power_off: 'Устройство выключено',
};

const SEVERITY_COLORS: Record<string, string> = {
  info: '#3b82f6',
  warning: '#f59e0b',
  critical: '#ef4444',
};

interface Props {
  event: TrackEvent;
  onPress?: () => void;
}

export default function EventCard({ event, onPress }: Props) {
  const color = SEVERITY_COLORS[event.severity] || '#94a3b8';
  const icon = EVENT_ICONS[event.event_type] || { name: 'file-text', color };
  const label = EVENT_LABELS[event.event_type] || event.event_type;

  const time = new Date(event.created_at).toLocaleString();

  return (
    <TouchableOpacity style={[styles.card, { borderLeftColor: color }]} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.row}>
        <Feather name={icon.name as any} size={20} color={icon.color} style={styles.icon} />
        <View style={styles.content}>
          <Text style={styles.type}>{label}</Text>
          <Text style={styles.message} numberOfLines={2}>{event.message}</Text>
          <Text style={styles.time}>{time}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  icon: { marginRight: 8, marginTop: 2 },
  content: { flex: 1 },
  type: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  message: { fontSize: 13, color: '#475569', marginTop: 2 },
  time: { fontSize: 11, color: '#94a3b8', marginTop: 4 },
});
