import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useAuth } from '@/contexts/AuthContext';
import { COLORS } from '@/constants/theme';

function getInitials(name: string, email: string | null | undefined) {
  const trimmedName = name.trim();

  if (trimmedName) {
    return trimmedName
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('');
  }

  if (email) {
    return email.slice(0, 2).toUpperCase();
  }

  return 'FP';
}

export default function ProfileScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const displayName = user?.displayName || 'Anonymous';
  const email = user?.email || 'No email';
  const initials = useMemo(() => getInitials(displayName, user?.email), [displayName, user?.email]);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      router.replace('/');
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>

        <Text style={styles.name}>{displayName}</Text>
        <Text style={styles.email}>{email}</Text>

        <Pressable disabled={isLoggingOut} onPress={handleLogout} style={styles.logoutButton}>
          {isLoggingOut ? (
            <ActivityIndicator color={COLORS.text} />
          ) : (
            <Text style={styles.logoutButtonText}>Logout</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 10,
  },
  avatar: {
    width: 104,
    height: 104,
    borderRadius: 52,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.accent,
    marginBottom: 8,
  },
  avatarText: {
    color: COLORS.text,
    fontSize: 34,
    fontWeight: '800',
  },
  name: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  email: {
    color: COLORS.textMuted,
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'center',
  },
  logoutButton: {
    minWidth: 180,
    minHeight: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.accent,
    paddingHorizontal: 20,
  },
  logoutButtonText: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '700',
  },
});
