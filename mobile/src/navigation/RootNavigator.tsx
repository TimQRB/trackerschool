import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { useLive } from '../context/LiveContext';
import AuthStack from './AuthStack';
import ParentTabs from './ParentTabs';
import SchoolTabs from './SchoolTabs';
import SOSAlertScreen from '../screens/sos/SOSAlertScreen';

const RootStack = createNativeStackNavigator();

function MainTabs() {
  const { user } = useAuth();
  if (user?.role === 'school' || user?.role === 'admin') {
    return <SchoolTabs />;
  }
  return <ParentTabs />;
}

export default function RootNavigator() {
  const { user, loading: authLoading } = useAuth();
  const { loadInitialData } = useLive();

  useEffect(() => {
    if (user) {
      loadInitialData().catch((e) => console.warn('loadInitialData error:', e));
    }
  }, [user]);

  if (authLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#1e3a8a" />
      </View>
    );
  }

  if (!user) {
    return <AuthStack />;
  }

  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      <RootStack.Screen name="MainTabs" component={MainTabs} />
      <RootStack.Screen
        name="SOSAlert"
        component={SOSAlertScreen}
        options={{ presentation: 'fullScreenModal', animation: 'fade' }}
      />
    </RootStack.Navigator>
  );
}
