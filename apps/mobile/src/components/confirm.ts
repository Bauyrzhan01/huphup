import { Alert, Platform } from 'react-native';

/** Yes/no question; react-native-web has no Alert buttons, so the web build asks the browser. */
export function confirm(title: string, message: string, okText: string, destructive = false) {
  return new Promise<boolean>((resolve) => {
    if (Platform.OS === 'web') {
      resolve(Boolean(globalThis.confirm?.(`${title}\n\n${message}`)));
      return;
    }
    Alert.alert(title, message, [
      { text: 'Отмена', style: 'cancel', onPress: () => resolve(false) },
      { text: okText, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ]);
  });
}
