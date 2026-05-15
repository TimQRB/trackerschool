import { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useLive } from '../../context/LiveContext';
import { api } from '../../api/client';
import type { Contact } from '../../api/types';

const TYPE_LABELS: Record<string, { title: string; icon: string; feather: string }> = {
  family: { title: 'Быстрый вызов', icon: 'phone', feather: 'phone' },
  sos: { title: 'SOS номера', icon: 'alert-octagon', feather: 'alert-octagon' },
  whitelist: { title: 'Белый список', icon: 'file-text', feather: 'file-text' },
};

export default function ContactsScreen() {
  const insets = useSafeAreaInsets();
  const { students } = useLive();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);

  const deviceId = students[0]?.student.device?.id;

  useEffect(() => {
    if (!deviceId) {
      setLoading(false);
      return;
    }
    api.get<Contact[]>(`/api/contacts?device_id=${deviceId}`)
      .then((res) => setContacts(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [deviceId]);

  const grouped: Record<string, Contact[]> = {
    family: contacts.filter((c) => c.contact_type === 'family'),
    sos: contacts.filter((c) => c.contact_type === 'sos'),
    whitelist: contacts.filter((c) => c.contact_type === 'whitelist'),
  };

  return (
    <View style={styles.container}>
      <View style={[styles.topbar, { paddingTop: insets.top + 10 }]}>
        <Text style={styles.title}>Контакты</Text>
        {students[0] && <Text style={styles.subtitle}>{students[0].student.full_name}</Text>}
      </View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator size="large" color="#1e3a8a" /></View>
      ) : !deviceId ? (
        <View style={styles.centered}><Text style={styles.emptyText}>Нет устройства</Text></View>
      ) : (
        <FlatList
          data={['family', 'sos', 'whitelist']}
          keyExtractor={(item) => item}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const type = item as string;
            const group: Contact[] = grouped[type] || [];
            const info = TYPE_LABELS[type];
            return (
              <View style={styles.section}>
                <View style={styles.sectionTitleRow}>
                  <Feather name={info?.feather as any} size={16} color="#0f172a" />
                  <Text style={styles.sectionTitle}> {info?.title} ({group.length})</Text>
                </View>
                {group.length === 0 ? (
                  <Text style={styles.emptyText}>Нет номеров</Text>
                ) : (
                  group.map((c) => (
                    <View key={c.id} style={styles.contactRow}>
                      <View style={styles.contactInfo}>
                        <Text style={styles.contactName}>{c.display_name}</Text>
                        <Text style={styles.contactNumber}>{c.number}</Text>
                      </View>
                      <TouchableOpacity
                        style={styles.callBtn}
                        onPress={() => Linking.openURL(`tel:${c.number}`)}
                      >
                        <Feather name="phone" size={18} color="white" />
                      </TouchableOpacity>
                    </View>
                  ))
                )}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  topbar: { paddingHorizontal: 16,  paddingBottom: 12, backgroundColor: '#1e3a8a' },
  title: { color: 'white', fontSize: 18, fontWeight: '700' },
  subtitle: { color: '#93c5fd', fontSize: 13, marginTop: 2 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#0f172a', marginBottom: 8 },
  emptyText: { fontSize: 13, color: '#94a3b8', fontStyle: 'italic', paddingLeft: 4 },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  contactInfo: { flex: 1 },
  contactName: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  contactNumber: { fontSize: 13, color: '#64748b', marginTop: 2 },
  callBtn: {
    backgroundColor: '#22c55e',
    borderRadius: 8,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center' },
});
