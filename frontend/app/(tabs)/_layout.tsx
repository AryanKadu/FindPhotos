import { Ionicons } from '@expo/vector-icons';
import { Tabs, useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { COLORS } from '@/constants/theme';

export default function TabLayout() {
  const router = useRouter();

  return (
    <Tabs
      initialRouteName="organizer"
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.surface },
        headerTintColor: COLORS.text,
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: COLORS.background },
        tabBarStyle: {
          backgroundColor: COLORS.surface,
          borderTopColor: COLORS.border,
          height: 66,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarActiveTintColor: COLORS.accent,
        tabBarInactiveTintColor: COLORS.textMuted,
        headerRight: () => (
          <Pressable onPress={() => router.push('/profile')} style={styles.headerButton}>
            {({ pressed }) => (
              <Ionicons
                color={COLORS.text}
                name="person-circle-outline"
                size={26}
                style={{ opacity: pressed ? 0.7 : 1 }}
              />
            )}
          </Pressable>
        ),
      }}>
      <Tabs.Screen
        name="organizer"
        options={{
          title: 'Organizer',
          tabBarIcon: ({ color, size }) => <Ionicons color={color} name="folder-open-outline" size={size} />,
        }}
      />
      <Tabs.Screen
        name="attendee"
        options={{
          title: 'Attendee',
          tabBarIcon: ({ color, size }) => <Ionicons color={color} name="camera-outline" size={size} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  headerButton: {
    marginRight: 14,
  },
});
