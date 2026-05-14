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
  const [selectedMonths, setSelectedMonths] = useState(1);

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

  const basePrice = 2000;
  
  const plans = [
    { months: 1, price: basePrice * 1, label: '1 Month', savings: null },
    { months: 3, price: basePrice * 3, label: '3 Months', savings: 'Quarterly' },
    { months: 6, price: basePrice * 5, label: '6 Months', savings: '1 Month Free' },
    { months: 12, price: basePrice * 10, label: '1 Year', savings: '2 Months Free' },
  ];

  const selectedPlan = plans.find(p => p.months === selectedMonths) || plans[0];
  const totalPrice = selectedPlan.price;
  const originalPrice = basePrice * selectedMonths;
  
  const paymentData = {
    reference: (new Date()).getTime().toString(),
    email: user?.email || '',
    amount: totalPrice * 100, // Paystack works in kobo
    publicKey: paystackConfig?.publicKey || '',
    currency: paystackConfig?.currency || 'NGN',
  };

  const onSuccessPayment = async (reference: any) => {
    try {
      const now = new Date();
      // If user already has a future expiry, add to it. Otherwise start from now.
      const currentExpiryStr = user?.subscriptionExpiry;
      const currentExpiry = (currentExpiryStr && new Date(currentExpiryStr) > now) 
        ? new Date(currentExpiryStr) 
        : now;
      
      const newExpiry = new Date(currentExpiry);
      newExpiry.setMonth(newExpiry.getMonth() + selectedMonths);

      await updateDoc(doc(db, 'users', user.uid), {
        subscriptionTier: 'premium',
        subscriptionExpiry: newExpiry.toISOString(),
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
        className="w-full bg-white text-blue-600 font-black py-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-slate-100 transition-all active:scale-95 shadow-xl mt-6"
      >
        <CreditCard size={18} />
        PAY ₦{totalPrice.toLocaleString()} NOW
      </button>
    );
  };

  if (isLoading) return null;

  return (
    <div className="fixed inset-0 z-[110] bg-slate-950/90 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-slate-800 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <img 
              src="https://res.cloudinary.com/dfsfskmha/image/upload/v1778482307/rusba/rusba-tv-logo-blkbg_plumhb.png" 
              alt="RusbaTV Logo" 
              className="h-8 w-auto object-contain mr-2"
              referrerPolicy="no-referrer"
            />
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-600 rounded-xl">
                <Crown className="text-white" size={20} />
              </div>
              <h2 className="text-lg font-bold text-white tracking-tight">Premium Access</h2>
            </div>
          </div>
          <button 
            onClick={onClose} 
            aria-label="Close pricing modal"
            className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar">
          <div className="grid grid-cols-2 gap-3">
            {plans.map((plan) => (
              <button
                key={plan.months}
                onClick={() => setSelectedMonths(plan.months)}
                aria-label={`Select ${plan.label} plan for ${plan.price} Naira`}
                className={`p-4 rounded-2xl border transition-all text-left relative ${
                  selectedMonths === plan.months 
                    ? 'bg-blue-600 border-blue-500 shadow-lg shadow-blue-600/20' 
                    : 'bg-slate-800/40 border-slate-800 hover:border-slate-700'
                }`}
              >
                {plan.savings && (
                  <span className={`absolute top-2 right-2 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${
                    selectedMonths === plan.months ? 'bg-white text-blue-600' : 'bg-blue-600 text-white'
                  }`}>
                    {plan.savings}
                  </span>
                )}
                <p className={`text-xs font-bold uppercase tracking-widest mb-1 ${selectedMonths === plan.months ? 'text-blue-100' : 'text-slate-500'}`}>
                  {plan.label}
                </p>
                <div className="flex items-center gap-2">
                  <p className="text-xl font-black text-white">₦{plan.price.toLocaleString()}</p>
                  {plan.price < (basePrice * plan.months) && (
                    <p className={`text-[10px] line-through font-bold ${selectedMonths === plan.months ? 'text-blue-200' : 'text-slate-500'}`}>
                      ₦{(basePrice * plan.months).toLocaleString()}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>

          <div className="bg-blue-600/10 border border-blue-500/20 rounded-2xl p-6 text-white">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">Included Benefits</span>
              <span className="text-[10px] font-black bg-blue-600 text-white px-2 py-0.5 rounded">LIFETIME UPDATES</span>
            </div>
            
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
              {[
                'No Ads or Interruption',
                'Ultra HD 4k Quality',
                'Multi-device Sync',
                'All Sports Channels',
                'Instant Activation',
                '24/7 Support'
              ].map((feature) => (
                <li key={feature} className="flex items-center gap-2 text-[11px] font-bold text-slate-300">
                  <Check size={14} className="text-blue-400" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            <PaymentButton />
          </div>

          <div className="flex items-center gap-4 p-4 bg-slate-800/30 border border-slate-800 rounded-2xl">
            <div className="p-2 bg-emerald-500/10 rounded-lg">
              <ShieldCheck size={20} className="text-emerald-400" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Secure Payment</p>
              <p className="text-xs text-slate-300">Encrypted via Paystack Integration</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
