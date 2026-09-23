import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../auth/AuthContext';
import { colors } from '../theme';

function RootStack() {
  const { user, restoring } = useAuth();

  if (restoring) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator color={colors.dark} />
      </View>
    );
  }

  const signedIn = Boolean(user);
  // Suppliers own a company or were added to one (both get the SUPPLIER role).
  const hasCompany = Boolean(user?.company) || user?.role === 'SUPPLIER';
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Protected guard={signedIn && hasCompany}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="leads/[id]" />
        <Stack.Screen name="chats/[id]" />
        <Stack.Screen name="profile" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !hasCompany}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="login" />
        <Stack.Screen name="register" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <RootStack />
        <StatusBar style="dark" />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
});
