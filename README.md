# Dukaansaathi-ai-
# DukaanSaathi AI 🇮🇳
**Aapki Dukaan Ka Digital Saathi** — A mobile-first, WhatsApp-style Hinglish AI business companion designed for Indian local shopkeepers, kirana stores, and small freelancers.

---

## 🚀 Key Features
1. **Hinglish AI Voice/Text Chat:** Shopkeepers can speak or type naturally in Hinglish (e.g., *"Aaj 5 kg chawal bika"*), and the app logs everything instantly.
2. **Smart Inventory & Godown Tracking:** Real-time stock updates, automated subtractions, and low-stock threshold alerts.
3. **Price Guru Calculator:** Built-in pricing safety guardrails (clamped between 5% to 60% margin) tailored for Indian local retail categories (Staples, FMCG, Snacks, etc.).
4. **WhatsApp Customer Message Generator:** Generates 1-click polite payment reminders, festival offers, and restock alerts with direct `wa.me` links.

---

## 🛠️ Tech Stack
* **Frontend:** React 19, Tailwind CSS v4, Lucide Icons, Vite
* **Backend:** Node.js, Express.js, TypeScript
* **AI Integration:** Google Gemini SDK (`gemini-3.8-flash`)
* **Architectural Safeguard:** *Code does the math, AI does the language.* (Deterministic math handles inventory counts & margins, while Gemini handles natural Hinglish copywriting).

---

## ⚙️ Local Development & Running
1. Clone the repository to your local environment.
2. Install dependencies:
   ```bash
   npm install
Set up your .env file with your Gemini API key (GEMINI_API_KEY).
Run the development server:
npm run dev
