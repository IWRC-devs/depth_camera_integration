import React, { createContext, useContext, useState, ReactNode } from "react";

export type ImageItem = {
  id: string;
  uri: string;
  source?: "depth-camera" | "upload";
  metadata?: Record<string, unknown>;
};

export type CollectionData = {
  synced: boolean | null;
  id: string | null;
  name: string;
  affiliationId?: number;
  botanicalName: string | null;
  weedBackground: string | null;
  growthStage: string | null;
  soilColor: string | null;
  lightingId?: number;
  images: ImageItem[];
  savedAt?: string;
  syncedAt?: string;
};

type CollectionContextType = {
  collectionData: CollectionData | null;
  setCollectionData: (data: CollectionData | null) => void;
};

const CollectionContext = createContext<CollectionContextType | undefined>(undefined);

export const useCollection = () => {
  const context = useContext(CollectionContext);
  if (!context) throw new Error("useCollection must be used within CollectionProvider");
  return context;
};

export const CollectionProvider = ({ children }: { children: ReactNode }) => {
  const [collectionData, setCollectionData] = useState<CollectionData | null>(null);

  return (
    <CollectionContext.Provider value={{ collectionData, setCollectionData }}>
      {children}
    </CollectionContext.Provider>
  );
};

export const createNewCollection = (): CollectionData => {
  const timestamp = new Date().toISOString();
  return {
    synced: null,
    id: null,
    name: `collection-${timestamp}`,
    affiliationId: undefined,
    botanicalName: null,
    weedBackground: null,
    growthStage: null,
    soilColor: null,
    lightingId: undefined,
    images: [],
  };
};
