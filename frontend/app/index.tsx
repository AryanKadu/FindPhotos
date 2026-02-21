import { useState } from 'react';
import { FirebaseError } from 'firebase/app';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAuth } from '@/contexts/AuthContext';
import { COLORS } from '@/constants/theme';

type FieldErrors = {
  name?: string;
  email?: string;
  password?: string;
};

function getAuthErrorMessage(error: unknown) {
  if (!(error instanceof FirebaseError)) {
    return 'Something went wrong. Please try again.';
  }

  switch (error.code) {
    case 'auth/email-already-in-use':
      return 'That email is already registered.';
    case 'auth/invalid-email':
      return 'Enter a valid email address.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.';
    case 'auth/invalid-credential':
      return 'Invalid email or password.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Try again in a few minutes.';
    default:
      return 'Authentication failed. Please try again.';
  }
}

export default function AuthScreen() {
  const router = useRouter();
  const { login, register } = useAuth();

  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [authError, setAuthError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const validate = () => {
    const errors: FieldErrors = {};

    if (isRegisterMode && !name.trim()) {
      errors.name = 'Name is required.';
    }

    if (!email.trim()) {
      errors.email = 'Email is required.';
    } else if (!/\S+@\S+\.\S+/.test(email.trim())) {
      errors.email = 'Enter a valid email.';
    }

    if (!password) {
      errors.password = 'Password is required.';
    } else if (password.length < 6) {
      errors.password = 'Minimum 6 characters.';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    setAuthError('');
    if (!validate()) {
      return;
    }

    setIsLoading(true);
    try {
      if (isRegisterMode) {
        await register(name, email, password);
      } else {
        await login(email, password);
      }
      router.replace('/(tabs)/organizer');
    } catch (error) {
      setAuthError(getAuthErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  const toggleMode = () => {
    setIsRegisterMode((current) => !current);
    setFieldErrors({});
    setAuthError('');
    setPassword('');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <View style={styles.container}>
          <Text style={styles.brand}>FindPhotos</Text>
          <Text style={styles.title}>{isRegisterMode ? 'Create Account' : 'Welcome Back'}</Text>
          <Text style={styles.subtitle}>
            {isRegisterMode ? 'Register to sync and find your event photos.' : 'Login to continue.'}
          </Text>

          <View style={styles.card}>
            {isRegisterMode ? (
              <View style={styles.fieldBlock}>
                <Text style={styles.label}>Name</Text>
                <TextInput
                  autoCapitalize="words"
                  onChangeText={setName}
                  placeholder="Your name"
                  placeholderTextColor={COLORS.textMuted}
                  style={styles.input}
                  value={name}
                />
                {fieldErrors.name ? <Text style={styles.errorText}>{fieldErrors.name}</Text> : null}
              </View>
            ) : null}

            <View style={styles.fieldBlock}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                onChangeText={setEmail}
                placeholder="name@email.com"
                placeholderTextColor={COLORS.textMuted}
                style={styles.input}
                value={email}
              />
              {fieldErrors.email ? <Text style={styles.errorText}>{fieldErrors.email}</Text> : null}
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                autoComplete="password"
                onChangeText={setPassword}
                placeholder="********"
                placeholderTextColor={COLORS.textMuted}
                secureTextEntry
                style={styles.input}
                value={password}
              />
              {fieldErrors.password ? <Text style={styles.errorText}>{fieldErrors.password}</Text> : null}
            </View>

            {authError ? <Text style={styles.errorText}>{authError}</Text> : null}

            <Pressable disabled={isLoading} onPress={handleSubmit} style={styles.primaryButton}>
              {isLoading ? (
                <ActivityIndicator color={COLORS.text} />
              ) : (
                <Text style={styles.primaryButtonText}>{isRegisterMode ? 'Register' : 'Login'}</Text>
              )}
            </Pressable>

            <Pressable onPress={toggleMode} style={styles.modeButton}>
              <Text style={styles.modeButtonText}>
                {isRegisterMode ? 'Already have an account? Login' : `Need an account? Register`}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  brand: {
    color: COLORS.accent,
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  title: {
    color: COLORS.text,
    fontSize: 32,
    fontWeight: '800',
  },
  subtitle: {
    color: COLORS.textMuted,
    fontSize: 14,
    marginBottom: 8,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
    gap: 14,
  },
  fieldBlock: {
    gap: 6,
  },
  label: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '600',
  },
  input: {
    backgroundColor: COLORS.surfaceSoft,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 12,
    color: COLORS.text,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 12,
  },
  primaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: COLORS.accent,
    minHeight: 46,
    paddingHorizontal: 16,
  },
  primaryButtonText: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '700',
  },
  modeButton: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  modeButtonText: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: '500',
  },
});
