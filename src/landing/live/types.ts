export type PlatformLiveFeedItem = {
  id: string;
  kind: 'request' | 'offer' | 'company';
  code: string | null;
  label: string;
  city: string | null;
  status?: string;
  at: string;
};

export type PlatformLiveFlow = {
  phase: 'idle' | 'processing' | 'delivery';
  code: string;
  label: string;
  originCity: string | null;
  deliveryCities: string[];
  updatedAt: string;
};

export type PlatformLive = {
  checkedAt: string;
  stats: {
    requestsToday: number;
    offersToday: number;
    companies: number;
    products: number;
    online: number;
    acceptedTotal: number;
  };
  feed: PlatformLiveFeedItem[];
  /** Сколько всего публичных заявок — лента отдаёт не более feedLimit из них. */
  feedTotal?: number;
  feedLimit?: number;
  cities: Array<{ name: string; count: number }>;
  pulse: PlatformLiveFeedItem | null;
  flow: PlatformLiveFlow | null;
};

export type MapCity = {
  id: string;
  label: string;
  x: number;
  y: number;
  aliases: string[];
};
