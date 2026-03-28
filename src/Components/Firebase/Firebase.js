
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getStorage } from "firebase/storage";
import { collection, getDocs, getFirestore } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";

// New Firebase project config
const firebaseConfig = {
  apiKey: "AIzaSyBgDajegNHhBUhGN7cKXYTkFI1X1mg_THw",
  authDomain: "xchange-555555.firebaseapp.com",
  projectId: "xchange-555555",
  // Use the appspot bucket domain (required for Storage API)
  storageBucket: "xchange-555555.appspot.com",
  messagingSenderId: "392393991994",
  appId: "1:392393991994:web:b1c8a4e2de3c9579315203"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const storage = getStorage(app);
const fireStore = getFirestore(app);
const analytics = getAnalytics(app);


const fetchFromFirestore = async () => {
    try {
      const productsCollection = collection(fireStore, 'products');
      const productSnapshot = await getDocs(productsCollection);
      const productList = productSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) 
      console.log("Fetched products from Firestore:", productList);
      return productList;
    } catch (error) {
      console.error("Error fetching products from Firestore:", error);
      return [];
    }
  };
  

  export {
    auth,
    provider,
    storage,
    fireStore,
    fetchFromFirestore
  }
