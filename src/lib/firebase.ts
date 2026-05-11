import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { initializeFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// Using initializeFirestore with experimentalForceLongPolling to bypass potential WebSocket
// blocks in the preview / deployment environment. This ensures immediate transport fallback.
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  useFetchStreams: false, // Prevents fetch stream hanging issues in some browser environments
}, firebaseConfig.firestoreDatabaseId || '(default)');

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

/**
 * Tests the Firestore connection with retries to account for transient network issues on boot.
 */
export async function testConnection(retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      // config/global is our known public-read config doc
      await getDocFromServer(doc(db, 'config', 'global'));
      console.log("Firestore connection established successfully.");
      return;
    } catch (error) {
      if (i === retries - 1) {
        console.error("Firestore connection failed persistently. Current State: OFFLINE");
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Final check: Client is reported as offline. Please verify Firebase Project ID and Database ID mapping.");
        }
      } else {
        console.warn(`Firestore handshake attempt ${i + 1} failed, retrying in 2 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }
}

export const signIn = async () => {
  try {
    return await signInWithPopup(auth, googleProvider);
  } catch (error: any) {
    if (error.code === 'auth/cancelled-popup-request') {
      console.warn('Sign-in popup was closed or cancelled.');
      return null;
    }
    console.error('Sign-in error:', error);
    throw error;
  }
};
export const logout = () => signOut(auth);

// Test connection on boot
testConnection();
