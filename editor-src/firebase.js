// 앱이 쓰는 Firebase 기능만 모아 묶는다 → ../vendor/firebase.js
// 고친 뒤 editor-src 폴더에서 `npm run build`
export { initializeApp } from 'firebase/app';
export {
  getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut, connectAuthEmulator,
} from 'firebase/auth';
export {
  initializeFirestore, memoryLocalCache, collection, doc, query, where, onSnapshot, writeBatch, connectFirestoreEmulator,
  serverTimestamp, Timestamp,
} from 'firebase/firestore';
