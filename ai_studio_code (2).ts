export interface ShopProfile {
  shopName: string;
  ownerName: string;
  shopType: 'kirana' | 'bakery' | 'tailor' | 'salon' | 'general';
  city: string;
  language: 'hinglish' | 'hindi' | 'english';
  upiId: string;
  phone: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  hindiName?: string;
  category: string;
  currentStock: number;
  unit: string;
  costPrice: number;
  sellingPrice: number;
  minThreshold: number;
  suggestedRestockQty: number;
  lastUpdated: string;
}

export interface PriceSuggestion {
  costPrice: number;
  minPrice: number;
  suggestedPrice: number;
  maxPrice: number;
  minMarginPct: number;
  suggestedMarginPct: number;
  maxMarginPct: number;
  profitPerUnit: number;
  category: string;
  explanation: string;
  guardrailApplied: boolean;
  aiExplanation?: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: string;
  audioUsed?: boolean;
  changesSummary?: string[];
  lowStockAlerts?: string[];
  pricingData?: PriceSuggestion;
  whatsappMessage?: {
    text: string;
    whatsappUrl: string;
    type: string;
  };
}