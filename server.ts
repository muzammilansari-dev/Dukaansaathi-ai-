import express, { Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import {
  calculatePricingGuardrails,
  applyInventoryUpdates,
  ruleBasedFallbackParser,
  validateAndSanitizeInput,
  InventoryItemState,
  ParsedItemAction,
} from './server/logic.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = parseInt(process.env.PORT || '3000', 10);

app.use(express.json({ limit: '5mb' }));

// Initialize GoogleGenAI SDK per guidelines
const apiKey = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;
if (apiKey) {
  ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Helper with timeout to prevent hanging on network latency
async function callWithTimeout<T>(promise: Promise<T>, timeoutMs = 7000): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Gemini call timed out')), timeoutMs);
  });
  // Prevent unhandled promise rejection if background call fails after timeout
  promise.catch(() => {});
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

const SYSTEM_INSTRUCTION = `You are DukaanSaathi AI (दुकान साथी AI), a trusted, practical, warm business companion for Indian local shopkeepers, kirana store owners, home bakers, and freelancers.

Guidelines:
1. Speak in natural, friendly Hinglish (conversational Hindi written in Roman English script, e.g., "Namaste Sharma ji! Chawal ka hisaab update kar diya hai.").
2. Always show respect using Indian honorifics ("Bhaiya", "Ji", "Didi").
3. DO NOT DO THE ARITHMETIC OR INVENTORY MATH YOURSELF - the application code calculates exact stock subtractions, margins, and thresholds deterministically. Your job is:
   - Extract raw user inputs (quantities, items, prices, actions) accurately into structured parameters.
   - Explain business decisions with local market intelligence (mandi trends, festival demand, FMCG margins, wholesale pricing).
   - Write warm, copy-paste ready WhatsApp messages for customers (payment reminders, festive offers, arrival alerts).
4. For customer messages, provide respectful, polite language so customer relations remain strong.
5. If the user input is ambiguous (e.g. "2 packet de do" without specifying item), politely ask for clarification in Hinglish instead of hallucinating.`;

/**
 * Chat endpoint that parses Hinglish statements, updates inventory using deterministic code,
 * and formats a rich Hinglish business response.
 */
app.post('/api/chat', async (req: Request, res: Response) => {
  try {
    const { message, shopProfile, inventory, history = [] } = req.body;

    // Defensive Check 1 & 2: Input Sanitization and Junk / Ambiguity Validation
    const validation = validateAndSanitizeInput(message);
    const currentInventory: InventoryItemState[] = Array.isArray(inventory) ? inventory : [];

    if (!validation.isValid) {
      res.json({
        reply: validation.clarificationMessage || 'Kripya dukan ka hisaab batayein.',
        intent: 'general',
        updatedInventory: currentInventory,
        changesSummary: [],
        lowStockAlerts: [],
        pricingData: null,
        customerMessageData: null,
      });
      return;
    }

    const sanitizedMessage = validation.sanitized;
    const profile = shopProfile || {
      shopName: 'Dukaan',
      ownerName: 'Vyapari Ji',
      shopType: 'kirana',
      city: 'India',
      language: 'hinglish',
    };

    let parsedActions: ParsedItemAction[] = [];
    let assistantReply = '';
    let pricingData: any = null;
    let customerMessageData: any = null;
    let detectedIntent: 'stock' | 'price' | 'message' | 'general' = 'general';

    // Call Gemini API if key is present
    if (ai) {
      try {
        const extractionPrompt = `User's Shop: "${profile.shopName}" (${profile.shopType}) in ${profile.city}.
Current inventory list available in shop:
${JSON.stringify(currentInventory.map(i => ({ name: i.name, currentStock: i.currentStock, unit: i.unit, costPrice: i.costPrice, sellingPrice: i.sellingPrice })))}

User message: "${sanitizedMessage}"

Task:
Analyze the message and extract:
1. Intent: one of ["stock_update", "price_query", "customer_message", "general_advice"]
2. Actions: array of items mentioned for sale, restock, or count.
   Each action has: { name: string, action: "sale" | "restock" | "current_stock" | "query", qty: number, unit: string, costPrice: number, sellingPrice: number }
3. If user is asking for pricing: { costPrice: number, category: string, itemName: string }
4. If user wants a customer WhatsApp message: { type: "payment_reminder" | "festival_offer" | "restock_alert" | "discount", customerName: string, amount: number, details: string }
5. Conversational Hinglish reply: Friendly, respectful explanation acknowledging what was recorded or answering the query in warm Hinglish. Keep it concise.

Return STRICT JSON matching this schema:
{
  "intent": "stock_update" | "price_query" | "customer_message" | "general_advice",
  "actions": [
    {
      "name": "string",
      "action": "sale" | "restock" | "current_stock" | "query",
      "qty": 0,
      "unit": "string",
      "costPrice": 0,
      "sellingPrice": 0
    }
  ],
  "pricingQuery": {
    "costPrice": 0,
    "category": "string",
    "itemName": "string"
  },
  "messageRequest": {
    "type": "payment_reminder" | "festival_offer" | "restock_alert" | "discount",
    "customerName": "string",
    "amount": 0,
    "details": "string"
  },
  "hinglishReply": "string"
}`;

        const geminiRes = await callWithTimeout(
          ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: extractionPrompt,
            config: {
              systemInstruction: SYSTEM_INSTRUCTION,
              responseMimeType: 'application/json',
            },
          }),
          8000
        );

        const rawText = geminiRes.text || '{}';
        const parsed = JSON.parse(rawText);

        if (Array.isArray(parsed.actions)) {
          parsedActions = parsed.actions;
        }
        if (parsed.intent) {
          if (parsed.intent === 'stock_update') detectedIntent = 'stock';
          else if (parsed.intent === 'price_query') detectedIntent = 'price';
          else if (parsed.intent === 'customer_message') detectedIntent = 'message';
        }

        if (parsed.pricingQuery && parsed.pricingQuery.costPrice > 0) {
          pricingData = calculatePricingGuardrails(
            parsed.pricingQuery.costPrice,
            parsed.pricingQuery.category || profile.shopType || 'general'
          );
        }

        if (parsed.messageRequest && parsed.messageRequest.type) {
          customerMessageData = parsed.messageRequest;
        }

        assistantReply = parsed.hinglishReply || '';
      } catch (err: any) {
        console.warn('Gemini extraction failed, using deterministic fallback parser:', err?.message);
        const fallback = ruleBasedFallbackParser(sanitizedMessage);
        parsedActions = fallback.actions;
        detectedIntent = fallback.intent;
      }
    } else {
      const fallback = ruleBasedFallbackParser(sanitizedMessage);
      parsedActions = fallback.actions;
      detectedIntent = fallback.intent;
    }

    // Execute architectural safeguard: CODE DOES MATH
    const mathResult = applyInventoryUpdates(currentInventory, parsedActions);

    if (!assistantReply) {
      if (mathResult.changesSummary.length > 0) {
        assistantReply = `Namaste ${profile.ownerName.split(' ')[0]} ji! 🙏 Aapka hisaab note kar liya:\n• ${mathResult.changesSummary.join('\n• ')}`;
        if (mathResult.lowStockAlerts.length > 0) {
          assistantReply += `\n\n🚨 Dhyan dein:\n${mathResult.lowStockAlerts.join('\n')}`;
        }
      } else if (detectedIntent === 'price') {
        const costMatch = sanitizedMessage.match(/(\d+)/);
        const cost = costMatch ? parseFloat(costMatch[1]) : 50;
        pricingData = calculatePricingGuardrails(cost, profile.shopType);
        assistantReply = `Namaste ji! ₹${cost} cost price par hamara sujhaav hai:\n• Suggested Selling Price: ₹${pricingData.suggestedPrice} (${pricingData.suggestedMarginPct}% margin)\n• Munafa: ₹${pricingData.profitPerUnit} prati unit.\n• Price Range: ₹${pricingData.minPrice} se ₹${pricingData.maxPrice} ke beech rakhein.`;
      } else {
        assistantReply = `Namaste ${profile.ownerName.split(' ')[0]} ji! 🙏 DukaanSaathi aapki seva me hajir hai. Stock update, price suggestion ya WhatsApp message banane ke liye batayein!`;
      }
    }

    if (!pricingData && detectedIntent === 'price') {
      const costMatch = sanitizedMessage.match(/(\d+)/);
      if (costMatch) {
        pricingData = calculatePricingGuardrails(parseFloat(costMatch[1]), profile.shopType);
      }
    }

    res.json({
      reply: assistantReply,
      intent: detectedIntent,
      updatedInventory: mathResult.updatedInventory,
      changesSummary: mathResult.changesSummary,
      lowStockAlerts: mathResult.lowStockAlerts,
      pricingData,
      customerMessageData,
    });
  } catch (error: any) {
    console.error('Error in /api/chat:', error);
    res.status(500).json({ error: error?.message || 'Server error' });
  }
});

/**
 * Dedicated pricing calculator endpoint with margin guardrails (5% to 60%)
 */
app.post('/api/pricing', async (req: Request, res: Response) => {
  try {
    const { costPrice, category = 'general', customMargin, shopProfile } = req.body;
    const numCost = parseFloat(costPrice);

    if (isNaN(numCost) || numCost <= 0) {
      res.status(400).json({ error: 'Valid costPrice is required' });
      return;
    }

    const pricing = calculatePricingGuardrails(numCost, category, customMargin ? parseFloat(customMargin) : undefined);
    let aiExplanation = pricing.explanation;

    if (ai) {
      try {
        const prompt = `Local shop context: "${shopProfile?.shopName || 'Kirana store'}" in ${shopProfile?.city || 'India'}.
Cost Price: ₹${pricing.costPrice}
Suggested Selling Price: ₹${pricing.suggestedPrice} (Margin: ${pricing.suggestedMarginPct}%)
Price Range: ₹${pricing.minPrice} - ₹${pricing.maxPrice}
Profit per unit: ₹${pricing.profitPerUnit}
Category: ${pricing.category}

Explain in 2-3 lines of friendly Hinglish to the shopkeeper why this pricing and margin fits local Indian market competition, customer price sensitivity, and cash flow. Mention a practical retail tip (like rounding to ₹0 or ₹5, bundle deals, or credit risk).`;

        const geminiRes = await callWithTimeout(
          ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: prompt,
            config: {
              systemInstruction: SYSTEM_INSTRUCTION,
            },
          }),
          7000
        );

        if (geminiRes.text) {
          aiExplanation = geminiRes.text.trim();
        }
      } catch (err) {
        console.warn('AI explanation failed in pricing, using rule-based formula:', err);
      }
    }

    res.json({
      ...pricing,
      aiExplanation,
    });
  } catch (error: any) {
    console.error('Error in /api/pricing:', error);
    res.status(500).json({ error: error?.message || 'Server error' });
  }
});

/**
 * Dedicated WhatsApp Customer Message Generator
 */
app.post('/api/generate-message', async (req: Request, res: Response) => {
  try {
    const { type, customerName, phone, amount, itemName, offerDetails, shopProfile } = req.body;

    const profile = shopProfile || {
      shopName: 'Sharma Kirana Store',
      ownerName: 'Ramesh Sharma',
      city: 'Kanpur',
      upiId: 'sharmakirana@upi',
      phone: '+91 98390 12345',
    };

    let messageText = '';

    if (ai) {
      try {
        const prompt = `Shop Name: "${profile.shopName}", Owner: "${profile.ownerName}", UPI ID: "${profile.upiId}", City: "${profile.city}".
Customer Name: "${customerName || 'Grahak Ji'}"
Type of message: "${type}" (one of: payment_reminder, festival_offer, restock_alert, weekend_special)
Key details: Amount: ₹${amount || 0}, Item: "${itemName || ''}", Extra Details: "${offerDetails || ''}"

Draft an authentic, polite, high-converting WhatsApp message in Hinglish with relevant emojis.
- If payment_reminder: Keep it respectful, gentle, remind them of the pending amount ₹${amount}, provide UPI ID "${profile.upiId}", and thank them for being a valued customer.
- If festival_offer or weekend_special: Make it exciting, celebratory, highlighting special fresh stock or discount at "${profile.shopName}".
- If restock_alert: Inform them that fresh stock of "${itemName || 'products'}" has just arrived.

Format for WhatsApp with proper line breaks and asterisks for *bold*. Keep it under 80 words.`;

        const geminiRes = await callWithTimeout(
          ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: prompt,
            config: {
              systemInstruction: SYSTEM_INSTRUCTION,
            },
          }),
          7000
        );

        messageText = geminiRes.text ? geminiRes.text.trim() : '';
      } catch (err) {
        console.warn('Gemini copywriting failed, using template fallback:', err);
      }
    }

    if (!messageText) {
      if (type === 'payment_reminder') {
        messageText = `Pranam ${customerName || 'Bhaiya'} ji 🙏\n\nUmeed hai aap kushal mangal hain. ${profile.shopName} par aapka bacha hua khata hisaab ₹${amount || 0} ka hai.\n\nAap suvidhanusar UPI se bhej sakte hain:\n📲 *UPI ID:* ${profile.upiId}\n\nKisi bhi sahayata ke liye sampark karein. Dhanyawad! ✨\n— ${profile.ownerName}, ${profile.shopName}`;
      } else if (type === 'restock_alert') {
        messageText = `Ram Ram ji! 🙏\n\nAapke pasandida *${itemName || 'Taaza Maal'}* ka naya batch ${profile.shopName} par aa gaya hai! 🛍️\n\nStock limited hai, toh aaj hi visit karein ya WhatsApp par order likhwayein.\n\n📍 ${profile.shopName}, ${profile.city}`;
      } else {
        messageText = `Dhamaka Offer! 🎉✨\n\n${profile.shopName} par is hafte vishesh chhoot aur taza maal uplabdh hai!\n\n${offerDetails || 'Behtareen daam aur shuddh gunvatta.'}\n\nAaj hi dukan par aayein ya WhatsApp par order karein!\n— ${profile.ownerName} 🙏`;
      }
    }

    const cleanPhone = phone ? phone.replace(/[^0-9]/g, '') : '';
    const encodedText = encodeURIComponent(messageText);
    const whatsappUrl = cleanPhone ? `https://wa.me/${cleanPhone}?text=${encodedText}` : `https://wa.me/?text=${encodedText}`;

    res.json({
      message: messageText,
      whatsappUrl,
      type,
    });
  } catch (error: any) {
    console.error('Error in /api/generate-message:', error);
    res.status(500).json({ error: error?.message || 'Server error' });
  }
});

app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    name: 'DukaanSaathi AI',
    hasApiKey: !!process.env.GEMINI_API_KEY,
    timestamp: new Date().toISOString(),
  });
});

async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`DukaanSaathi AI server running at http://0.0.0.0:${port}`);
  });
}

startServer();
