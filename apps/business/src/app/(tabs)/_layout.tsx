import { Tabs } from 'expo-router';
import Inbox from 'lucide-react-native/icons/inbox';
import MessageSquare from 'lucide-react-native/icons/message-square';
import Send from 'lucide-react-native/icons/send';
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
        options={{ title: 'Заявки', tabBarIcon: ({ color }) => <Inbox size={22} color={color} /> }}
      />
      <Tabs.Screen
        name="offers"
        options={{ title: 'Предложения', tabBarIcon: ({ color }) => <Send size={21} color={color} /> }}
      />
      <Tabs.Screen
        name="deals"
        options={{ title: 'Сделки', tabBarIcon: ({ color }) => <ShieldCheck size={22} color={color} /> }}
      />
      <Tabs.Screen
        name="chats"
        options={{ title: 'Чаты', tabBarIcon: ({ color }) => <MessageSquare size={22} color={color} /> }}
      />
      <Tabs.Screen
        name="balance"
        options={{ title: 'Баланс', tabBarIcon: ({ color }) => <Wallet size={22} color={color} /> }}
      />
    </Tabs>
  );
}
