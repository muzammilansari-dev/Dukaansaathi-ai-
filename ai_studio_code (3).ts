import React, { useState, useEffect } from 'react';
import { Header } from './components/Header.tsx';
import { BottomNav } from './components/BottomNav.tsx';
import { ChatTab } from './components/ChatTab.tsx';
import { InventoryTab } from './components/InventoryTab.tsx';
import { PricingTab } from './components/PricingTab.tsx';
import { WhatsAppTab } from './components/WhatsAppTab.tsx';
import { ProfileModal } from './components/ProfileModal.tsx';
import { DEMO_PRESETS } from './data/sampleData.ts';
import { ShopProfile, InventoryItem, ChatMessage } from './types.ts';
import { Package, TrendingUp, Sparkles, MessageCircle } from 'lucide-react';

const STORAGE_KEY_PROFILE = 'dukaansaathi_profile_v1';
const STORAGE_KEY_INVENTORY = 'dukaansaathi_inventory_v1';
const STORAGE_KEY_MESSAGES = 'dukaansaathi_messages_v1';
const STORAGE_KEY_DARK = 'dukaansaathi_dark_v1';

export default function App() {
  const [isDark, setIsDark] = useState<boolean>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_DARK);
    if (saved !== null) return saved === 'true';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem(STORAGE_KEY_DARK, isDark.toString());
  }, [isDark]);

  const toggleDark = () => setIsDark((prev) => !prev);

  const [activeTab, setActiveTab] = useState<'chat' | 'inventory' | 'pricing' | 'whatsapp' | 'profile'>('chat');

  const [shopProfile, setShopProfile] = useState<ShopProfile>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_PROFILE);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return DEMO_PRESETS[0].profile;
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_PROFILE, JSON.stringify(shopProfile));
    } catch (e) {}
  }, [shopProfile]);

  const [inventory, setInventory] = useState<InventoryItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_INVENTORY);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return DEMO_PRESETS[0].inventory;
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_INVENTORY, JSON.stringify(inventory));
    } catch (e) {}
  }, [inventory]);

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_MESSAGES);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [
      {
        id: 'welcome-1',
        sender: 'assistant',
        text: DEMO_PRESETS[0].welcomeMessage,
        timestamp: 'Aaj 9:00 AM',
      },
    ];
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_MESSAGES, JSON.stringify(messages));
    } catch (e) {}
  }, [messages]);

  const [isLoading, setIsLoading] = useState(false);
  const lowStockCount = inventory.filter((i) => i.currentStock <= i.minThreshold).length;

  const loadPreset = (presetId: string) => {
    const preset = DEMO_PRESETS.find((p) => p.id === presetId) || DEMO_PRESETS[0];
    setShopProfile(preset.profile);
    setInventory(preset.inventory);
    const welcomeMsg: ChatMessage = {
      id: 'welcome-' + Date.now(),
      sender: 'assistant',
      text: preset.welcomeMessage,
      timestamp: 'Aaj ' + new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
    };
    setMessages([welcomeMsg]);
    setActiveTab('chat');
  };

  const resetAll = () => {
    localStorage.removeItem(STORAGE_KEY_PROFILE);
    localStorage.removeItem(STORAGE_KEY_INVENTORY);
    localStorage.removeItem(STORAGE_KEY_MESSAGES);
    loadPreset('kirana-kanpur');
  };

  const handleSendMessage = async (userText: string, audioUsed: boolean = false) => {
    const timeString =
      'Aaj ' +
      new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

    const userMessage: ChatMessage = {
      id: 'msg-' + Date.now(),
      sender: 'user',
      text: userText,
      timestamp: timeString,
      audioUsed,
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userText,
          shopProfile,
          inventory,
          history: messages.slice(-6).map((m) => ({ role: m.sender, content: m.text })),
        }),
      });

      if (!res.ok) throw new Error('API response failed');
      const data = await res.json();

      if (Array.isArray(data.updatedInventory) && data.updatedInventory.length > 0) {
        setInventory(data.updatedInventory);
      }

      const assistantMessage: ChatMessage = {
        id: 'msg-reply-' + Date.now(),
        sender: 'assistant',
        text: data.reply,
        timestamp: 'Aaj ' + new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
        changesSummary: data.changesSummary,
        lowStockAlerts: data.lowStockAlerts,
        pricingData: data.pricingData,
        whatsappMessage: data.customerMessageData
          ? {
              text: data.customerMessageData.details || data.reply,
              whatsappUrl: `https://wa.me/?text=${encodeURIComponent(data.customerMessageData.details || data.reply)}`,
              type: data.customerMessageData.type,
            }
          : undefined,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: any) {
      console.warn('Chat request failed, generating client fallback message:', err);
      const fallbackReply: ChatMessage = {
        id: 'msg-err-' + Date.now(),
        sender: 'assistant',
        text: `Namaste ${shopProfile.ownerName.split(' ')[0]} ji! Aapka message note kar liya gaya hai. Kripya Stock ya Price Guru tab me jakar jankari dekhein.`,
        timestamp: timeString,
      };
      setMessages((prev) => [...prev, fallbackReply]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplyPricingToStock = (name: string, newSellingPrice: number) => {
    setInventory((prev) =>
      prev.map((item) => {
        if (item.name.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(item.name.toLowerCase())) {
          return { ...item, sellingPrice: newSellingPrice };
        }
        return item;
      })
    );
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors">
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        shopProfile={shopProfile}
        lowStockCount={lowStockCount}
        isDark={isDark}
        toggleDark={toggleDark}
        loadPreset={loadPreset}
        resetAll={resetAll}
      />

      <main className="flex-1 w-full">
        {activeTab === 'chat' && (
          <div className="max-w-7xl mx-auto px-2 sm:px-6 py-2 sm:py-4">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-8 w-full">
                <ChatTab
                  messages={messages}
                  onSendMessage={handleSendMessage}
                  isLoading={isLoading}
                  inventory={inventory}
                  shopProfile={shopProfile}
                  onApplyPricingToStock={handleApplyPricingToStock}
                  onNavigateToTab={setActiveTab}
                />
              </div>

              <div className="hidden lg:flex lg:col-span-4 flex-col gap-4">
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-xs">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700">
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-emerald-600" />
                      <span className="text-xs font-bold text-slate-900 dark:text-white">
                        Live Godown Snapshot
                      </span>
                    </div>
                    <button
                      onClick={() => setActiveTab('inventory')}
                      className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold hover:underline"
                    >
                      Pura Stock Dekhein →
                    </button>
                  </div>

                  <div className="mt-3 space-y-2 max-h-[320px] overflow-y-auto pr-1 chat-scroll text-xs">
                    {inventory.slice(0, 6).map((item) => {
                      const isLow = item.currentStock <= item.minThreshold;
                      return (
                        <div
                          key={item.id}
                          className={`p-2.5 rounded-xl border flex items-center justify-between transition-colors ${
                            isLow
                              ? 'bg-amber-50/70 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800'
                              : 'bg-slate-50 dark:bg-slate-900/60 border-slate-100 dark:border-slate-800'
                          }`}
                        >
                          <div className="min-w-0 pr-2">
                            <div className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                              {item.name}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              ₹{item.sellingPrice} · {item.category}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div
                              className={`font-mono font-bold text-xs tabular-nums ${
                                isLow ? 'text-amber-700 dark:text-amber-300' : 'text-slate-800 dark:text-slate-200'
                              }`}
                            >
                              {item.currentStock} {item.unit}
                            </div>
                            {isLow && (
                              <div className="text-[9px] text-amber-600 font-semibold">
                                Low Stock!
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-slate-900 border border-emerald-200 dark:border-emerald-800 rounded-2xl p-4 shadow-xs text-xs space-y-3">
                  <div className="font-bold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-emerald-600" />
                    <span>DukaanSaathi Superpowers</span>
                  </div>

                  <div className="space-y-2">
                    <button
                      onClick={() => setActiveTab('pricing')}
                      className="w-full text-left p-2.5 bg-white dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-slate-750 border border-emerald-100 dark:border-slate-700 rounded-xl transition-colors flex items-center justify-between"
                    >
                      <div>
                        <div className="font-semibold text-slate-800 dark:text-slate-200">
                          Price Guru Calculator
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          Kharid daam par safe retail margin nikalein
                        </div>
                      </div>
                      <TrendingUp className="w-4 h-4 text-emerald-600" />
                    </button>

                    <button
                      onClick={() => setActiveTab('whatsapp')}
                      className="w-full text-left p-2.5 bg-white dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-slate-750 border border-emerald-100 dark:border-slate-700 rounded-xl transition-colors flex items-center justify-between"
                    >
                      <div>
                        <div className="font-semibold text-slate-800 dark:text-slate-200">
                          WhatsApp Message Generator
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          Udhaar reminder aur festive offer 1-click me
                        </div>
                      </div>
                      <MessageCircle className="w-4 h-4 text-emerald-600" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'inventory' && (
          <InventoryTab
            inventory={inventory}
            setInventory={setInventory}
            shopProfile={shopProfile}
            onNavigateToTab={setActiveTab}
          />
        )}

        {activeTab === 'pricing' && (
          <PricingTab
            shopProfile={shopProfile}
            onApplyPriceToInventory={handleApplyPricingToStock}
          />
        )}

        {activeTab === 'whatsapp' && (
          <WhatsAppTab shopProfile={shopProfile} />
        )}

        {activeTab === 'profile' && (
          <ProfileModal
            shopProfile={shopProfile}
            setShopProfile={setShopProfile}
          />
        )}
      </main>

      <BottomNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        lowStockCount={lowStockCount}
      />
    </div>
  );
}