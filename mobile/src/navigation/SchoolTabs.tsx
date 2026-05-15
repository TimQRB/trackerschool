import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import ClassMapScreen from '../screens/school/ClassMapScreen';
import AttendanceScreen from '../screens/school/AttendanceScreen';
import BatchCommandsScreen from '../screens/school/BatchCommandsScreen';

const Tab = createBottomTabNavigator();

export default function SchoolTabs() {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, Platform.OS === 'ios' ? 20 : 8);

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#1e3a8a',
        tabBarInactiveTintColor: '#94a3b8',
        tabBarStyle: {
          paddingBottom: 6,
          paddingTop: 4,
          height: 50 + bottomPad,
        },
        tabBarLabelStyle: { fontSize: 11, marginTop: 0 },
      }}
    >
      <Tab.Screen
        name="ClassMap"
        component={ClassMapScreen}
        options={{
          tabBarLabel: 'Карта',
          tabBarIcon: ({ color, size }) => <Feather name="map-pin" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Attendance"
        component={AttendanceScreen}
        options={{
          tabBarLabel: 'Посещаемость',
          tabBarIcon: ({ color, size }) => <Feather name="file-text" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="BatchCommands"
        component={BatchCommandsScreen}
        options={{
          tabBarLabel: 'Команды',
          tabBarIcon: ({ color, size }) => <Feather name="volume-2" size={size} color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}
