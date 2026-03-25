import { collection, onSnapshot, deleteDoc, doc } from "firebase/firestore";
import { createContext, useContext, useEffect, useState } from "react";
import { fireStore } from "../Firebase/Firebase";

const Context = createContext(null);
export const ItemsContext = () => useContext(Context); // custom hook

// Seed catalog removed; only user-generated listings remain.
const seedItems = [];

export const ItemsContextProvider = ({ children }) => {
  const [items, setItems] = useState(seedItems);
  const deleteItem = async (id) => {
    await deleteDoc(doc(fireStore, 'products', id))
    setItems((prev) => (prev || []).filter((it) => it.id !== id))
  }

  useEffect(() => {
    const productsCollection = collection(fireStore, 'products'); // firestore collection names are case-sensitive
    const unsubscribe = onSnapshot(
      productsCollection,
      (snapshot) => {
        const productsList = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        const combined = [...seedItems, ...productsList];
        const unique = [];
        const seen = new Set();
        for (const item of combined) {
          if (seen.has(item.id)) continue;
          seen.add(item.id);
          unique.push(item);
        }
        unique.sort((a, b) => {
          const getDate = (entry) => new Date(entry?.createAt || entry?.createdAt || 0).getTime();
          return getDate(b) - getDate(a);
        });
        setItems(unique);
      },
      (error) => {
        console.log(error, 'error fetching products');
      }
    );

    return () => unsubscribe();
  }, []);

  return (
    <Context.Provider value={{ items, setItems, deleteItem }}>
      {children}
    </Context.Provider>
  );
};

