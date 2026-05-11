import React, { useState, useEffect } from 'react';
import { usePaystackPayment } from 'react-paystack';
import { db } from '../lib/firebase';
import { doc, updateDoc, onSnapshot } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrorHandler';
import { X, Check, Crown, CreditCard, ShieldCheck } from 'lucide-react';

interface PricingProps {
  user: any;
  onClose: () => void;
  onSuccess: () => void;
}

export function Pricing({ user, onClose, onSuccess }: PricingProps) {
  const [paystackConfig, setPaystackConfig] = useState<any>(null);
  const [adsConfig, setAdsConfig] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Sync Configs
    const configUnsub = onSnapshot(doc(db, 'config', 'global'), (doc) => {
      if (doc.exists()) setAdsConfig(doc.data());
    });

    const paystackUnsub = onSnapshot(doc(db, 'config', 'paystack'), (doc) => {
      if (doc.exists()) {
        setPaystackConfig(doc.data());
      }
      setIsLoading(false);
    });

    return () => {
      configUnsub();
      paystackUnsub();
    };
  }, []);

  const price = adsConfig?.premiumPrice || 5000;
  
  const paymentData = {
    reference: (new Date()).getTime().toString(),
    email: user?.email || '',
    amount: price * 100, // Paystack works in kobo
    publicKey: paystackConfig?.publicKey || '',
    currency: paystackConfig?.currency || 'NGN',
  };

  const onSuccessPayment = async (reference: any) => {
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        subscriptionTier: 'premium',
        lastPaymentRef: reference.reference,
        updatedAt: new Date().toISOString()
      });
      onSuccess();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const onClosePayment = () => {
    console.log('Payment closed');
  };

  const PaymentButton = () => {
    const initializePayment = usePaystackPayment(paymentData);
    return (
      <button 
        onClick={() => {
          if (!paystackConfig?.isEnabled || !paystackConfig?.publicKey) {
            alert("Paystack is not configured correctly by the administrator.");
            return;
          }
          initializePayment({ onSuccess: onSuccessPayment, onClose: onClosePayment });
        }}
        className="w-full bg-white text-blue-600 font-black py-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-slate-100 transition-all active:scale-95 shadow-xl"
      >
        <CreditCard size={18} />
        UPGRADE NOW
      </button>
    );
  };

  if (isLoading) return null;

  return (
    <div className="fixed inset-0 z-[110] bg-slate-950/90 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
        <div className="p-8 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-xl">
              <Crown className="text-white" size={24} />
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight">Select a Plan</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400">
            <X size={24} />
          </button>
        </div>

        <div className="p-8 space-y-6">
          <div className="bg-blue-600 border border-blue-500 rounded-3xl p-8 text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <Crown size={120} />
            </div>
            
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-4">
                <span className="bg-white/20 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">Premium Yearly</span>
                <span className="text-sm font-bold opacity-80">Most Popular</span>
              </div>
              
              <div className="flex items-baseline gap-1 mb-8">
                <span className="text-4xl font-black tracking-tighter">₦{price.toLocaleString()}</span>
                <span className="text-sm font-bold opacity-70">/ Year</span>
              </div>

              <ul className="space-y-4 mb-8">
                <li className="flex items-center gap-3 text-sm font-bold">
                  <Check size={16} />
                  <span>No Ads or Interruption</span>
                </li>
                <li className="flex items-center gap-3 text-sm font-bold">
                  <Check size={16} />
                  <span>Ultra HD 4k Quality</span>
                </li>
                <li className="flex items-center gap-3 text-sm font-bold">
                  <Check size={16} />
                  <span>Multi-device Sync</span>
                </li>
                <li className="flex items-center gap-3 text-sm font-bold">
                  <Check size={16} />
                  <span>Exclusive Content Guide</span>
                </li>
              </ul>
              <PaymentButton />
            </div>
          </div>

          <div className="flex items-center gap-4 p-4 bg-slate-800/30 border border-slate-800 rounded-2xl">
            <div className="p-2 bg-emerald-500/10 rounded-lg">
              <ShieldCheck size={20} className="text-emerald-400" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Secure Payment</p>
              <p className="text-xs text-slate-300">Fast and encrypted via Paystack</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
