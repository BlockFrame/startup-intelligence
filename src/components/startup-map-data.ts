export interface StartupMapData {
  techEvent: {
    id: string;
    title: string;
    location: string;
    lat: number;
    lng: number;
    country: string;
    startDate: string;
    endDate: string;
    url: string | null;
    daysUntil: number;
  };
}

export interface StartupMapCache {
  techEvents?: StartupMapData['techEvent'][];
}
