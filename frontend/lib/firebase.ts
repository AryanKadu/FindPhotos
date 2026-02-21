import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { getApp, getApps, initializeApp } from 'firebase/app';
import * as FirebaseAuth from 'firebase/auth';
import {
  browserLocalPersistence,
  getAuth,
  initializeAuth,
  setPersistence,
} from 'firebase/auth';

type FirebaseExtraConfig = {
  firebaseApiKey?: string;
  firebaseAuthDomain?: string;
  firebaseProjectId?: string;
  firebaseStorageBucket?: string;
  firebaseMessagingSenderId?: string;
  firebaseAppId?: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as FirebaseExtraConfig;

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? extra.firebaseApiKey ?? 'YOUR_FIREBASE_API_KEY',
  authDomain:
    process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? extra.firebaseAuthDomain ?? 'YOUR_PROJECT.firebaseapp.com',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? extra.firebaseProjectId ?? 'YOUR_PROJECT_ID',
  storageBucket:
    process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? extra.firebaseStorageBucket ?? 'YOUR_PROJECT.appspot.com',
  messagingSenderId:
    process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? extra.firebaseMessagingSenderId ?? 'YOUR_SENDER_ID',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? extra.firebaseAppId ?? 'YOUR_APP_ID',
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

const reactNativePersistenceFactory = (FirebaseAuth as unknown as {
  getReactNativePersistence?: (storage: typeof AsyncStorage) => unknown;
}).getReactNativePersistence;

const auth =
  Platform.OS === 'web'
    ? getAuth(app)
    : (() => {
        try {
          if (reactNativePersistenceFactory) {
            return initializeAuth(app, {
              persistence: reactNativePersistenceFactory(AsyncStorage) as never,
            });
          }

          return getAuth(app);
        } catch {
          return getAuth(app);
        }
      })();

if (Platform.OS === 'web') {
  setPersistence(auth, browserLocalPersistence).catch(() => undefined);
}

export { app, auth };
