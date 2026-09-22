import { Tabs } from 'expo-router';
import ClipboardList from 'lucide-react-native/icons/clipboard-list';
import House from 'lucide-react-native/icons/house';
import ShieldCheck from 'lucide-react-native/icons/shield-check';
import Wallet from 'lucide-react-native/icons/wallet';
import { colors } from '../../theme';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.dark,
        tabBarInactiveTintColor: '#9a9a9f',
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarStyle: { borderTopColor: colors.line },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Главная', tabBarIcon: ({ color }) => <House size={22} color={color} /> }}
      />
      <Tabs.Screen
        name="requests"
        options={{
          title: 'Заявки',
          tabBarIcon: ({ color }) => <ClipboardList size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="deals"
        options={{ title: 'Сделки', tabBarIcon: ({ color }) => <ShieldCheck size={22} color={color} /> }}
      />
      <Tabs.Screen
        name="balance"
        options={{ title: 'Баланс', tabBarIcon: ({ color }) => <Wallet size={22} color={color} /> }}
      />
    </Tabs>
  );
}
