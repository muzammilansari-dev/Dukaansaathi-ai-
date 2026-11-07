import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Mic,
  MicOff,
  Package,
  TrendingUp,
  Share2,
  Copy,
  Check,
  AlertCircle,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import { ChatMessage, InventoryItem, ShopProfile } from '../types.ts';

interface ChatTabProps {
  messages: ChatMessage[];
  onSendMessage: (text: string, audioUsed?: boolean) => Promise<void>;
  isLoading: boolean;
  inventory: InventoryItem[];
  shopProfile: ShopProfile;
  onApplyPricingToStock?: (itemName: string, sellingPrice: number) => void;
  onNavigateToTab: (tab: 'inventory' | 'pricing' | 'whatsapp') => void;
}

export const ChatTab: React.FC<ChatTabProps> = ({
  messages,
  onSendMessage,
  isLoading,
  inventory,
  shopProfile,
  onNavigateToTab,
}) => {
  const [inputText, setInputText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'hi-IN';

      recognition.onstart = () => {
        setIsRecording(true);
        setSpeechError(null);
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          setInputText(prev => (prev ? `${prev} ${transcript}` : transcript));
        }
        setIsRecording(false);
      };

      recognition.onerror = (event: any) => {
        if (event.error !== 'no-speech') {
          setSpeechError('Awaaz capture nahi ho saki, kripya type karein ya mic permission check karein.');
        }
        setIsRecording(false);
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = recognition;
    }
  }, []);

  const toggleRecording = () => {
    if (!recognitionRef.current) {
      setSpeechError('Aapke browser me Web Speech API uplabdh nahi hai. Kripya Chrome ya Edge use karein.');
      return;
    }

    if (isRecording) {
      recognitionRef.current.stop();
      setIsRecording(false);
    } else {
      setSpeechError(null);
      try {
        recognitionRef.current.start();
      } catch (e) {
        recognitionRef.current.stop();
        setTimeout(() => recognitionRef.current?.start(), 150);
      }
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = inputText.trim();
    if (!text || isLoading) return;
    setInputText('');
    await onSendMessage(text, false);
  };

  const handleChipClick = async (chipText: string) => {
    if (isLoading) return;
    setInputText(chipText);
    await onSendMessage(chipText, false);
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const quickChips = [
    { label: 'Aaj 5 kg chawal bika, 2 bacha', text: 'Aaj 5 kg chawal bika, 2 kg bacha' },
    { label: '10 packet Maggi aayi ₹50 rate me', text: '10 packet Maggi aayi ₹50 rate me' },
    { label: 'Basmati Chawal ka stock check', text: 'Basmati Chawal ka kitna stock bacha hai?' },
    { label: '₹65 cost par kitna rate lagayein?', text: '₹65 cost price par selling price kitna lagayein?' },
    { label: 'Ramesh ji ko ₹450 udhaar reminder', text: 'Ramesh ji ko ₹450 bache hue udhaar ka polite WhatsApp reminder message banao' },
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-7.5rem)] md:h-[calc(100vh-5.5rem)] max-w-4xl mx-auto bg-slate-50 dark:bg-slate-950 border-x border-slate-200 dark:border-slate-800 transition-colors">
      <div className="px-4 py-2.5 bg-emerald-700 text-white flex items-center justify-between shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-emerald-800 flex items-center justify-center font-bold text-xs border border-emerald-500/40">
            DS
          </div>
          <div>
            <div className="text-sm font-semibold flex items-center gap-1.5 leading-tight">
              <span>DukaanSaathi AI</span>
              <span className="text-[10px] bg-emerald-600/80 px-1.5 py-0.2 rounded font-normal">Hinglish Assistant</span>
            </div>
            <p className="text-[11px] text-emerald-100/90 leading-tight">
              {shopProfile.shopName} · Hamesha Ready
            </p>
          </div>
        </div>

        <button
          onClick={() => onNavigateToTab('inventory')}
          className="px-2.5 py-1 bg-emerald-800/80 hover:bg-emerald-800 rounded-md text-[11px] font-medium flex items-center gap-1 transition-colors"
        >
          <Package className="w-3 h-3" />
          <span>Stock ({inventory.length})</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 chat-scroll">
        {messages.map((msg) => {
          const isUser = msg.sender === 'user';

          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-full`}
            >
              <div
                className={`rounded-2xl px-4 py-3 max-w-[92%] sm:max-w-[80%] text-sm shadow-sm transition-all ${
                  isUser
                    ? 'bg-emerald-600 text-white rounded-tr-xs'
                    : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-tl-xs'
                }`}
              >
                <div className="whitespace-pre-wrap leading-relaxed">
                  {msg.text}
                </div>

                {msg.changesSummary && msg.changesSummary.length > 0 && (
                  <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-700 text-xs space-y-1">
                    <div className="font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1">
                      <Package className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Stock Registry Update:</span>
                    </div>
                    {msg.changesSummary.map((ch, idx) => (
                      <div key={idx} className="text-slate-600 dark:text-slate-300 pl-1 font-mono tabular-nums">
                        • {ch}
                      </div>
                    ))}
                  </div>
                )}

                {msg.lowStockAlerts && msg.lowStockAlerts.length > 0 && (
                  <div className="mt-2.5 p-2 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-800 dark:text-amber-200 space-y-1">
                    <div className="font-semibold flex items-center gap-1 text-amber-900 dark:text-amber-100">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                      <span>Restock Alert (Naya Maal Mangwayein):</span>
                    </div>
                    {msg.lowStockAlerts.map((alt, idx) => (
                      <div key={idx} className="pl-1">
                        {alt}
                      </div>
                    ))}
                  </div>
                )}

                {msg.pricingData && (
                  <div className="mt-3 p-3 bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                        <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                        Smart Pricing Breakdown
                      </span>
                      <span className="text-[10px] text-emerald-700 dark:text-emerald-300 font-medium">
                        {msg.pricingData.suggestedMarginPct}% Margin
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center py-1">
                      <div className="bg-white dark:bg-slate-800 p-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
                        <div className="text-[10px] text-slate-500">Kharid Cost</div>
                        <div className="font-bold text-slate-900 dark:text-white tabular-nums">
                          ₹{msg.pricingData.costPrice}
                        </div>
                      </div>
                      <div className="bg-emerald-50 dark:bg-emerald-950/60 p-1.5 rounded-lg border border-emerald-300 dark:border-emerald-700">
                        <div className="text-[10px] text-emerald-700 dark:text-emerald-300 font-medium">Suggested Sell</div>
                        <div className="font-bold text-emerald-900 dark:text-emerald-100 text-sm tabular-nums">
                          ₹{msg.pricingData.suggestedPrice}
                        </div>
                      </div>
                      <div className="bg-white dark:bg-slate-800 p-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
                        <div className="text-[10px] text-slate-500">Munafa / Unit</div>
                        <div className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                          ₹{msg.pricingData.profitPerUnit}
                        </div>
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      Sahi range: ₹{msg.pricingData.minPrice} - ₹{msg.pricingData.maxPrice}
                    </div>
                  </div>
                )}

                {msg.whatsappMessage && (
                  <div className="mt-3 p-3 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-xl space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold text-emerald-900 dark:text-emerald-200">
                      <span className="flex items-center gap-1.5">
                        <Share2 className="w-3.5 h-3.5 text-emerald-600" />
                        WhatsApp Ready Message
                      </span>
                      <button
                        onClick={() => copyToClipboard(msg.whatsappMessage!.text, msg.id)}
                        className="text-[11px] text-emerald-700 dark:text-emerald-300 hover:underline flex items-center gap-1"
                      >
                        {copiedId === msg.id ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                        {copiedId === msg.id ? 'Copied' : 'Copy'}
                      </button>
                    </div>

                    <div className="p-2 bg-white dark:bg-slate-900 rounded-lg text-xs font-mono text-slate-700 dark:text-slate-200 whitespace-pre-wrap border border-emerald-100 dark:border-emerald-900">
                      {msg.whatsappMessage.text}
                    </div>

                    <a
                      href={msg.whatsappMessage.whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      <span>WhatsApp Par Bhejein (wa.me)</span>
                    </a>
                  </div>
                )}

                <div
                  className={`mt-1.5 text-[10px] text-right tabular-nums ${
                    isUser ? 'text-emerald-100/80' : 'text-slate-400'
                  }`}
                >
                  {msg.timestamp}
                </div>
              </div>
            </div>
          );
        })}

        {isLoading && (
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 p-2 bg-white dark:bg-slate-800 rounded-xl w-fit border border-slate-200 dark:border-slate-700">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-600" />
            <span>DukaanSaathi hisaab jod raha hai...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {speechError && (
        <div className="mx-4 mb-2 p-2 bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800 rounded-lg text-xs flex items-center justify-between">
          <span>{speechError}</span>
          <button onClick={() => setSpeechError(null)} className="font-bold ml-2">×</button>
        </div>
      )}

      <div className="px-4 py-2 border-t border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 overflow-x-auto whitespace-nowrap scrollbar-none flex gap-1.5">
        {quickChips.map((chip, idx) => (
          <button
            key={idx}
            onClick={() => handleChipClick(chip.text)}
            disabled={isLoading}
            className="px-2.5 py-1 text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-emerald-50 dark:hover:bg-emerald-950 hover:text-emerald-700 dark:hover:text-emerald-300 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors shrink-0 disabled:opacity-50"
          >
            {chip.label}
          </button>
        ))}
      </div>

      <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shrink-0">
        <form onSubmit={handleSend} className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleRecording}
            aria-label="Voice Input"
            className={`min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center transition-all ${
              isRecording
                ? 'bg-rose-600 text-white animate-pulse shadow-md'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
            title="Bol kar type karein (Web Speech)"
          >
            {isRecording ? <MicOff className="w-5 h-5 text-white" /> : <Mic className="w-5 h-5" />}
          </button>

          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={isRecording ? 'Awaaz suni ja rahi hai... boliye...' : 'Boliye ya likhein: "Aaj 5 kg chawal bika, 2 bacha"...'}
            className="flex-1 min-h-[44px] px-3.5 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-white placeholder:text-slate-400"
          />

          <button
            type="submit"
            disabled={!inputText.trim() || isLoading}
            className="min-h-[44px] min-w-[44px] px-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-xl flex items-center justify-center transition-colors shadow-sm"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>

        <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 px-1">
          <div className="flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-emerald-600" />
            <span>Maths run on code · Phone numbers remain private in browser</span>
          </div>
          <span>Gemini 3.8 Flash</span>
        </div>
      </div>
    </div>
  );
};