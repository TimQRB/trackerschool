import { Marker, Callout } from 'react-native-maps';
import { View, Text, StyleSheet } from 'react-native';
import type { LocationPoint, Student } from '../api/types';

interface Props {
  student: Student;
  point: LocationPoint;
  isSelected: boolean;
  onPress: () => void;
}

export default function StudentMarker({ student, point, isSelected, onPress }: Props) {
  return (
    <Marker
      coordinate={{ latitude: point.lat, longitude: point.lon }}
      onPress={onPress}
      pinColor={isSelected ? '#dc2626' : '#1e3a8a'}
    >
      <Callout>
        <View style={styles.callout}>
          <Text style={styles.name}>{student.full_name}</Text>
          <Text style={styles.detail}>Класс: {student.class_name}</Text>
          <Text style={styles.detail}>Заряд: {point.battery ?? '—'}%</Text>
        </View>
      </Callout>
    </Marker>
  );
}

const styles = StyleSheet.create({
  callout: { padding: 4, minWidth: 120 },
  name: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  detail: { fontSize: 12, color: '#64748b', marginTop: 2 },
});
