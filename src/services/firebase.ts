import { initializeApp } from 'firebase/app';
import { getDatabase, ref, onValue, set, push, remove, DataSnapshot } from 'firebase/database';

// Firebase configuration - 請替換成您的 Firebase 設定
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    databaseURL: "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
    projectId: "YOUR_PROJECT",
    storageBucket: "YOUR_PROJECT.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

// Types
export interface HedgePosition {
    id: string;
    type: 'put' | 'call' | 'future';
    strike?: number;
    quantity: number;
    entryPrice: number;
    currentPrice?: number;
    expiry?: string;
    notes?: string;
    createdAt: number;
    updatedAt: number;
}

export interface MarketData {
    indexPrice: number;
    etfPrice: number;
    futurePrice: number;
    lastUpdated: number;
}

export interface AppSettings {
    etfShares: number;
    etfCost: number;
    targetHedgeRatio: number;
}

// Database references
const positionsRef = ref(database, 'positions');
const marketDataRef = ref(database, 'marketData');
const settingsRef = ref(database, 'settings');

// Position operations
export const subscribeToPositions = (callback: (positions: HedgePosition[]) => void) => {
    return onValue(positionsRef, (snapshot: DataSnapshot) => {
        const data = snapshot.val();
        if (data) {
            const positions = Object.entries(data).map(([id, pos]) => ({
                id,
                ...(pos as Omit<HedgePosition, 'id'>)
            }));
            callback(positions);
        } else {
            callback([]);
        }
    });
};

export const addPosition = async (position: Omit<HedgePosition, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newRef = push(positionsRef);
    const now = Date.now();
    await set(newRef, {
        ...position,
        createdAt: now,
        updatedAt: now
    });
    return newRef.key;
};

export const updatePosition = async (id: string, updates: Partial<HedgePosition>) => {
    const positionRef = ref(database, `positions/${id}`);
    await set(positionRef, {
        ...updates,
        updatedAt: Date.now()
    });
};

export const deletePosition = async (id: string) => {
    const positionRef = ref(database, `positions/${id}`);
    await remove(positionRef);
};

// Market data operations
export const subscribeToMarketData = (callback: (data: MarketData | null) => void) => {
    return onValue(marketDataRef, (snapshot: DataSnapshot) => {
        callback(snapshot.val());
    });
};

export const updateMarketData = async (data: Partial<MarketData>) => {
    await set(marketDataRef, {
        ...data,
        lastUpdated: Date.now()
    });
};

// Settings operations
export const subscribeToSettings = (callback: (settings: AppSettings | null) => void) => {
    return onValue(settingsRef, (snapshot: DataSnapshot) => {
        callback(snapshot.val());
    });
};

export const updateSettings = async (settings: Partial<AppSettings>) => {
    await set(settingsRef, settings);
};

export { database };
