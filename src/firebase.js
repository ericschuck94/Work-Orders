import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyD00v9LRtgKOh_RY7ohK56e2xjMOXdy8Vo",
  authDomain: "norwood-work-orders.firebaseapp.com",
  projectId: "norwood-work-orders",
  storageBucket: "norwood-work-orders.firebasestorage.app",
  messagingSenderId: "458283682979",
  appId: "1:458283682979:web:650acaec16136376890316",
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
