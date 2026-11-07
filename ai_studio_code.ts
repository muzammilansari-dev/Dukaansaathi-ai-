/**
 * Architectural Safeguards:
 * Code does the math, AI does the language.
 * Arithmetic, stock counts, margin bounds, and guardrails run in deterministic code.
 */

export interface ParsedItemAction {
  name: string;
  action: 'sale' | 'restock' | 'current_stock' | 'query';
  qty?: number;
  unit?: string;
  costPrice?: number;
  sellingPrice?: number;
}

export interface InventoryItemState {
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
}

// Category margin benchmarks for Indian Local Retail (Kirana / FMCG / Services)
export const CATEGORY_MARGIN_BENCHMARKS: Record<string, { minMargin: number; suggestedMargin: number; maxMargin: number }> = {
  staples: { minMargin: 6, suggestedMargin: 10, maxMargin: 15 }, // Atta, Chawal, Dal, Tel, Sugar
  fmcg: { minMargin: 10, suggestedMargin: 15, maxMargin: 22 }, // Biscuits, Soap, Shampoo, Detergent
  snacks: { minMargin: 12, suggestedMargin: 18, maxMargin: 25 }, // Chips, Maggi, Namkeen
  spices: { minMargin: 15, suggestedMargin: 22, maxMargin: 35 }, // Masale, Haldi, Mirch
  dairy: { minMargin: 5, suggestedMargin: 8, maxMargin: 12 }, // Milk, Paneer, Dahi (MRP capped, high velocity)
  bakery: { minMargin: 25, suggestedMargin: 40, maxMargin: 60 }, // Cakes, Cookies, Fresh bakery
  tailoring: { minMargin: 35, suggestedMargin: 50, maxMargin: 70 }, // Stitching, Alterations
  general: { minMargin: 12, suggestedMargin: 20, maxMargin: 30 },
};

export interface InputValidationResult {
  isValid: boolean;
  isJunk: boolean;
  sanitized: string;
  clarificationMessage?: string;
}

/**
 * Defensive check for unexpected, junk, or ambiguous user inputs.
 * Strips HTML/control chars, caps length, catches keyboard smash and unit-only ambiguities.
 */
export function validateAndSanitizeInput(rawInput: string): InputValidationResult {
  if (!rawInput || typeof rawInput !== 'string') {
    return {
      isValid: false,
      isJunk: true,
      sanitized: '',
      clarificationMessage: 'Kripya kuch likhein ya bolkar batayein. Jaise: "5 kg chawal bika" ya "Rate batao".',
    };
  }

  // Strip harmful control characters and cap at 500 characters
  const sanitized = rawInput
    .replace(/[<>{}|\\]/g, '')
    .trim()
    .slice(0, 500);

  if (sanitized.length < 2) {
    return {
      isValid: false,
      isJunk: true,
      sanitized,
      clarificationMessage: 'Bhaiya, sandesh bahut chhota hai. Kripya dukan ka hisaab poora batayein.',
    };
  }

  // Detect repeated single character keyboard spam (e.g., "aaaaaaa", "?????", ".......")
  if (/^(.)\1{4,}$/.test(sanitized)) {
    return {
      isValid: false,
      isJunk: true,
      sanitized,
      clarificationMessage: 'Yeh dukan ka hisaab nahi lag raha bhaiya. Kripya sahi item ya hisaab likhein (jaise: "5 kg chawal bika").',
    };
  }

  // Detect ambiguous unit-only inputs: e.g., "2 packet", "5 kg", "10 piece" without specifying item
  const isBareUnitOnly = /^(\d+(?:\.\d+)?)\s*(kg|kilo|packet|pkt|piece|pc|bory|bori|bag|liter|ltr|box)$/i.test(sanitized);
  if (isBareUnitOnly) {
    return {
      isValid: false,
      isJunk: false,
      sanitized,
      clarificationMessage: `Aapne "${sanitized}" bataya, lekin koun sa item? (Jaise: "${sanitized} Chawal bika"). Kripya item ka naam sath me batayein!`,
    };
  }

  return {
    isValid: true,
    isJunk: false,
    sanitized,
  };
}

/**
 * Calculates pricing with mathematical guardrails (5% to 60%).
 */
export function calculatePricingGuardrails(
  costPrice: number,
  categoryKey: string = 'general',
  customMarginPct?: number
): PriceSuggestion {
  const benchmark = CATEGORY_MARGIN_BENCHMARKS[categoryKey.toLowerCase()] || CATEGORY_MARGIN_BENCHMARKS.general;

  let chosenMargin = customMarginPct ?? benchmark.suggestedMargin;
  let guardrailApplied = false;

  // Clamped to sane margin range (5% to 60%)
  if (chosenMargin < 5) {
    chosenMargin = 5;
    guardrailApplied = true;
  } else if (chosenMargin > 60) {
    chosenMargin = 60;
    guardrailApplied = true;
  }

  // Exact currency calculations rounded to nearest rupee or 0.50
  const minPrice = Math.round(costPrice * (1 + benchmark.minMargin / 100));
  const suggestedPrice = Math.round(costPrice * (1 + chosenMargin / 100));
  const maxPrice = Math.round(costPrice * (1 + benchmark.maxMargin / 100));
  const profitPerUnit = Math.round((suggestedPrice - costPrice) * 100) / 100;

  return {
    costPrice,
    minPrice,
    suggestedPrice,
    maxPrice,
    minMarginPct: benchmark.minMargin,
    suggestedMarginPct: chosenMargin,
    maxMarginPct: benchmark.maxMargin,
    profitPerUnit,
    category: categoryKey,
    explanation: `Cost ₹${costPrice} par ${chosenMargin}% margin lagakar bechne par ₹${suggestedPrice} ka retail price sahi rahega (₹${profitPerUnit} munafa prati piece).`,
    guardrailApplied,
  };
}

/**
 * Deterministically applies stock operations on an existing inventory array.
 */
export function applyInventoryUpdates(
  currentInventory: InventoryItemState[],
  actions: ParsedItemAction[]
): {
  updatedInventory: InventoryItemState[];
  changesSummary: string[];
  lowStockAlerts: string[];
} {
  const updated = [...currentInventory.map(item => ({ ...item }))];
  const changesSummary: string[] = [];
  const lowStockAlerts: string[] = [];

  const timeString = 'Aaj ' + new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

  for (const act of actions) {
    if (!act.name) continue;

    // Fuzzy matching by name or partial name
    const queryName = act.name.toLowerCase().trim();
    let matchIndex = updated.findIndex(i => i.name.toLowerCase().includes(queryName) || queryName.includes(i.name.toLowerCase()));

    // Also check hindi name if available
    if (matchIndex === -1) {
      matchIndex = updated.findIndex(i => i.hindiName && (i.hindiName.includes(act.name) || act.name.includes(i.hindiName)));
    }

    const qty = typeof act.qty === 'number' && !isNaN(act.qty) ? Math.abs(act.qty) : 0;
    const unit = act.unit || (matchIndex !== -1 ? updated[matchIndex].unit : 'units');

    if (matchIndex !== -1) {
      const item = updated[matchIndex];
      const prevStock = item.currentStock;

      if (act.action === 'sale') {
        item.currentStock = Math.max(0, item.currentStock - qty);
        changesSummary.push(`${item.name}: ${qty} ${unit} bika (Stock: ${prevStock} → ${item.currentStock} ${item.unit})`);
      } else if (act.action === 'restock') {
        item.currentStock = item.currentStock + qty;
        changesSummary.push(`${item.name}: +${qty} ${unit} naya maal aaya (Stock: ${prevStock} → ${item.currentStock} ${item.unit})`);
      } else if (act.action === 'current_stock') {
        item.currentStock = qty;
        changesSummary.push(`${item.name}: Stock set to ${qty} ${unit} (pehle: ${prevStock} ${item.unit})`);
      }

      if (act.costPrice) item.costPrice = act.costPrice;
      if (act.sellingPrice) item.sellingPrice = act.sellingPrice;

      // Recompute suggested restock quantity
      item.suggestedRestockQty = Math.max(0, (item.minThreshold * 2) - item.currentStock);
      item.lastUpdated = timeString;

      // Check threshold
      if (item.currentStock <= item.minThreshold) {
        lowStockAlerts.push(`⚠️ ${item.name} ka stock kam hai! Bacha sirf ${item.currentStock} ${item.unit} (Alert threshold: ${item.minThreshold})`);
      }
    } else if (act.action === 'restock' || act.action === 'current_stock') {
      // New item introduced to stock
      const newItem: InventoryItemState = {
        id: 'item-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
        name: act.name.trim(),
        category: 'General Items',
        currentStock: qty,
        unit: act.unit || 'packet',
        costPrice: act.costPrice || 0,
        sellingPrice: act.sellingPrice || (act.costPrice ? Math.round(act.costPrice * 1.15) : 0),
        minThreshold: Math.max(5, Math.round(qty * 0.3)),
        suggestedRestockQty: Math.max(10, qty),
        lastUpdated: timeString,
      };
      updated.push(newItem);
      changesSummary.push(`Naya Item joda gaya: ${newItem.name} (${qty} ${newItem.unit})`);
    }
  }

  return {
    updatedInventory: updated,
    changesSummary: Array.from(new Set(changesSummary)),
    lowStockAlerts: Array.from(new Set(lowStockAlerts)),
  };
}

/**
 * Fallback parser in case Gemini API is offline or experiences rate limit.
 * Uses robust regex for Hinglish Kirana phrases.
 */
export function ruleBasedFallbackParser(text: string): {
  actions: ParsedItemAction[];
  intent: 'stock' | 'price' | 'message' | 'general';
} {
  const clean = text.toLowerCase().trim();
  const actions: ParsedItemAction[] = [];

  const saleRegex = /(\d+(?:\.\d+)?)\s*(kg|kilo|packet|pkt|liter|ltr|piece|pc|bory|bori|bag)?\s*([a-zA-Z\s]+?)\s*(?:bika|becha|sale|nikla|gaya)/i;
  const saleRegexAlt = /(?:bika|becha|sale)\s*(\d+(?:\.\d+)?)\s*(kg|kilo|packet|pkt|liter|ltr|piece|pc)?\s*([a-zA-Z\s]+)/i;
  const restockRegex = /(\d+(?:\.\d+)?)\s*(kg|kilo|packet|pkt|liter|ltr|piece|pc|box)?\s*([a-zA-Z\s]+?)\s*(?:aaya|aayi|aaye|restock|kharida|stock me joda)/i;
  const remainingRegex = /(\d+(?:\.\d+)?)\s*(kg|kilo|packet|pkt|liter|ltr|piece|pc)?\s*(?:bacha|bache|baaki)/i;

  let match = clean.match(saleRegex);
  if (match) {
    const qty = parseFloat(match[1]);
    const unit = match[2] || 'unit';
    const name = match[3].replace(/(aaj|kal|mera|ka|ki|ke)/gi, '').trim();
    if (name) {
      actions.push({ name, action: 'sale', qty, unit });
    }
  } else {
    match = clean.match(saleRegexAlt);
    if (match) {
      const qty = parseFloat(match[1]);
      const unit = match[2] || 'unit';
      const name = match[3].trim();
      if (name) {
        actions.push({ name, action: 'sale', qty, unit });
      }
    }
  }

  const restockMatch = clean.match(restockRegex);
  if (restockMatch) {
    const qty = parseFloat(restockMatch[1]);
    const unit = restockMatch[2] || 'unit';
    const name = restockMatch[3].replace(/(aaj|kal|naya|dukaan|pe)/gi, '').trim();
    if (name) {
      actions.push({ name, action: 'restock', qty, unit });
    }
  }

  const remMatch = clean.match(remainingRegex);
  if (remMatch && actions.length > 0) {
    const remQty = parseFloat(remMatch[1]);
    actions.push({ name: actions[0].name, action: 'current_stock', qty: remQty, unit: actions[0].unit });
  }

  let intent: 'stock' | 'price' | 'message' | 'general' = 'general';
  if (actions.length > 0 || clean.includes('stock') || clean.includes('maal') || clean.includes('bika')) {
    intent = 'stock';
  } else if (clean.includes('price') || clean.includes('bhav') || clean.includes('margin') || clean.includes('rate') || clean.includes('kitne me')) {
    intent = 'price';
  } else if (clean.includes('message') || clean.includes('whatsapp') || clean.includes('reminder') || clean.includes('udhaar') || clean.includes('offer')) {
    intent = 'message';
  }

  return { actions, intent };
}