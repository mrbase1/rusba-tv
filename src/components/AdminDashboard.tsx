import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Tv, 
  CreditCard, 
  Layout, 
  Save, 
  X, 
  Check, 
  AlertCircle,
  Plus,
  Trash2,
  ExternalLink,
  ShieldAlert,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { db } from '../lib/firebase';
import { 
  collection, 
  getDocs, 
  doc, 
  updateDoc, 
  setDoc, 
  deleteDoc, 
  onSnapshot,
  query,
  limit
} from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrorHandler';
import { Channel } from '../services/iptvService';

interface AdminDashboardProps {
  onClose: () => void;
  availableChannels: Channel[];
}

export function AdminDashboard({ onClose, availableChannels }: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<'users' | 'channels' | 'paystack' | 'ads'>('users');
  const [users, setUsers] = useState<any[]>([]);
  const [featuredChannels, setFeaturedChannels] = useState<any[]>([]);
  const [paystackConfig, setPaystackConfig] = useState<any>({
    publicKey: '',
    secretKey: '',
    isEnabled: false,
    currency: 'NGN'
  });
  const [adsConfig, setAdsConfig] = useState<any>({
    adsEnabled: false,
    adOverlayUrl: '',
    premiumPrice: 5000
  });
  const [ isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [channelSearchQuery, setChannelSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 24;

  useEffect(() => {
    setCurrentPage(1);
  }, [channelSearchQuery]);

  const filteredChannels = availableChannels.filter(ch => 
    ch.name.toLowerCase().includes(channelSearchQuery.toLowerCase()) || 
    ch.category?.toLowerCase().includes(channelSearchQuery.toLowerCase())
  );
  
  const totalPages = Math.ceil(filteredChannels.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedChannels = filteredChannels.slice(startIndex, startIndex + itemsPerPage);

  useEffect(() => {
    // Sync Users (limited to 50 for safety)
    const usersUnsub = onSnapshot(query(collection(db, 'users'), limit(50)), (snapshot) => {
      setUsers(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // Sync Featured Channels
    const channelsUnsub = onSnapshot(collection(db, 'featuredChannels'), (snapshot) => {
      setFeaturedChannels(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // Sync Paystack Config
    const paystackUnsub = onSnapshot(doc(db, 'config', 'paystack'), (doc) => {
      if (doc.exists()) setPaystackConfig(doc.data());
    });

    // Sync Ads Config
    const adsUnsub = onSnapshot(doc(db, 'config', 'global'), (doc) => {
      if (doc.exists()) setAdsConfig(doc.data());
    });

    return () => {
      usersUnsub();
      channelsUnsub();
      paystackUnsub();
      adsUnsub();
    };
  }, []);

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleUpdateUserTier = async (userId: string, tier: string) => {
    try {
      await updateDoc(doc(db, 'users', userId), { subscriptionTier: tier });
      showMessage('success', 'User updated');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
    }
  };

  const toggleFeatured = async (channel: Channel) => {
    const isFeatured = featuredChannels.find(f => f.channelId === channel.id);
    try {
      if (isFeatured) {
        await deleteDoc(doc(db, 'featuredChannels', channel.id));
        showMessage('success', 'Channel removed from featured');
      } else {
        await setDoc(doc(db, 'featuredChannels', channel.id), {
          channelId: channel.id,
          isFeatured: true,
          customName: channel.name,
          customLogo: channel.logo,
          featuredOrder: featuredChannels.length,
          updatedAt: new Date().toISOString()
        });
        showMessage('success', 'Channel added to featured');
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `featuredChannels/${channel.id}`);
    }
  };

  const saveConfig = async (collection: string, id: string, data: any) => {
    setIsLoading(true);
    try {
      await setDoc(doc(db, collection, id), { ...data, updatedAt: new Date().toISOString() }, { merge: true });
      showMessage('success', 'Settings saved successfully');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `${collection}/${id}`);
      showMessage('error', 'Failed to save settings');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950 flex flex-col items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-6xl h-full bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
          <div className="flex items-center gap-4">
            <img 
              src="https://res.cloudinary.com/dfsfskmha/image/upload/v1778482307/rusba/rusba-tv-logo-blkbg_plumhb.png" 
              alt="RusbaTV Logo" 
              className="h-10 w-auto object-contain"
              referrerPolicy="no-referrer"
            />
            <div className="h-10 w-px bg-slate-800 ml-2 mr-2 hidden sm:block"></div>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-600 rounded-lg">
                <ShieldAlert className="text-white" size={24} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white tracking-tight">Admin Operations</h2>
                <p className="text-xs text-slate-500 font-medium">Manage users, payments, and content</p>
              </div>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-white"
          >
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar */}
          <div className="w-64 border-r border-slate-800 p-4 space-y-2 bg-slate-900/30">
            <button 
              onClick={() => setActiveTab('users')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${activeTab === 'users' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
            >
              <Users size={18} />
              User Management
            </button>
            <button 
              onClick={() => setActiveTab('channels')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${activeTab === 'channels' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
            >
              <Tv size={18} />
              Featured Channels
            </button>
            <button 
              onClick={() => setActiveTab('paystack')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${activeTab === 'paystack' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
            >
              <CreditCard size={18} />
              Paystack Sync
            </button>
            <button 
              onClick={() => setActiveTab('ads')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${activeTab === 'ads' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
            >
              <Layout size={18} />
              Ad Overlays
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
            {message && (
              <div className={`mb-6 p-4 rounded-xl flex items-center gap-3 border shadow-sm animate-in fade-in slide-in-from-top-2 ${message.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
                {message.type === 'success' ? <Check size={18} /> : <AlertCircle size={18} />}
                <p className="text-sm font-bold">{message.text}</p>
              </div>
            )}

            {activeTab === 'users' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-bold text-white mb-2">User Registry</h3>
                  <p className="text-sm text-slate-500 italic">Manage subscription tiers and roles for registered users.</p>
                </div>
                <div className="bg-slate-800/50 border border-slate-800 rounded-2xl overflow-hidden">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-800/80 border-b border-slate-700">
                        <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">User Details</th>
                        <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Subscription</th>
                        <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Registered</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {users.map(u => (
                        <tr key={u.id} className="hover:bg-slate-800/30 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-white uppercase">
                                {u.displayName?.substring(0, 2) || u.email?.substring(0, 2)}
                              </div>
                              <div>
                                <p className="text-sm font-bold text-white">{u.displayName || 'Anonymous User'}</p>
                                <p className="text-xs text-slate-500">{u.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <select 
                              value={u.subscriptionTier || 'free'}
                              onChange={(e) => handleUpdateUserTier(u.id, e.target.value)}
                              className="bg-slate-900 border border-slate-700 text-xs font-bold rounded-lg px-3 py-1.5 focus:ring-1 focus:ring-blue-500 outline-none text-white appearance-none cursor-pointer hover:border-slate-500 transition-colors"
                            >
                              <option value="free">FREE</option>
                              <option value="premium">&crown; PREMIUM</option>
                            </select>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <p className="text-[10px] font-mono text-slate-500 uppercase tracking-tighter">
                              {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : 'N/A'}
                            </p>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'channels' && (
              <div className="space-y-6 animate-in fade-in h-full flex flex-col">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-bold text-white mb-2">Channel Featured Picks</h3>
                    <p className="text-sm text-slate-500 italic">Toggle which channels appear in the 'Featured' section of the app.</p>
                  </div>
                  <div className="relative w-full md:w-72">
                    <input 
                      type="text" 
                      placeholder="Search channels..." 
                      value={channelSearchQuery}
                      onChange={(e) => setChannelSearchQuery(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-4 pr-10 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-white placeholder:text-slate-500"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto pr-2 custom-scrollbar flex-1 pb-4">
                  {paginatedChannels.map(ch => {
                    const isFeatured = featuredChannels.some(f => f.channelId === ch.id);
                    return (
                      <div key={ch.id} className={`p-4 rounded-2xl border transition-all flex items-center gap-4 ${isFeatured ? 'bg-blue-600/10 border-blue-600/40' : 'bg-slate-800/40 border-slate-800'}`}>
                        <div className="w-12 h-12 bg-slate-900 rounded-lg p-2 flex-shrink-0 flex items-center justify-center border border-slate-800">
                          {ch.logo ? <img src={ch.logo} className="max-w-full max-h-full object-contain" referrerPolicy="no-referrer" /> : <Tv size={20} className="text-slate-700" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-white truncate">{ch.name}</p>
                          <p className="text-[10px] text-slate-500 uppercase tracking-widest">{ch.category}</p>
                        </div>
                        <button 
                          onClick={() => toggleFeatured(ch)}
                          className={`p-2 rounded-lg transition-all ${isFeatured ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                        >
                          {isFeatured ? <Check size={16} /> : <Plus size={16} />}
                        </button>
                      </div>
                    );
                  })}
                  {paginatedChannels.length === 0 && (
                    <div className="col-span-full py-20 flex flex-col items-center justify-center text-slate-500">
                      <Tv size={48} className="mb-4 opacity-10" />
                      <p className="font-bold">No channels found matching "{channelSearchQuery}"</p>
                    </div>
                  )}
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center justify-between pt-6 border-t border-slate-800 shrink-0">
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                      Showing <span className="text-white">{startIndex + 1}</span> to <span className="text-white">{Math.min(startIndex + itemsPerPage, filteredChannels.length)}</span> of <span className="text-white">{filteredChannels.length}</span> results
                    </p>
                    <div className="flex items-center gap-2">
                      <button 
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        className="p-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:text-slate-400 transition-all"
                      >
                        <ChevronLeft size={18} />
                      </button>
                      <div className="flex items-center gap-1">
                        {[...Array(Math.min(5, totalPages))].map((_, i) => {
                          let pageNum;
                          if (totalPages <= 5) {
                            pageNum = i + 1;
                          } else if (currentPage <= 3) {
                            pageNum = i + 1;
                          } else if (currentPage >= totalPages - 2) {
                            pageNum = totalPages - 4 + i;
                          } else {
                            pageNum = currentPage - 2 + i;
                          }

                          return (
                            <button
                              key={pageNum}
                              onClick={() => setCurrentPage(pageNum)}
                              className={`w-9 h-9 rounded-lg text-xs font-bold transition-all border ${currentPage === pageNum ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-600/20' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-white'}`}
                            >
                              {pageNum}
                            </button>
                          );
                        })}
                      </div>
                      <button 
                        disabled={currentPage === totalPages}
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        className="p-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:text-slate-400 transition-all"
                      >
                        <ChevronRight size={18} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'paystack' && (
              <div className="max-w-2xl space-y-8 animate-in fade-in slide-in-from-bottom-2">
                <div>
                  <h3 className="text-xl font-bold text-white mb-2">Paystack Integration Configuration</h3>
                  <p className="text-sm text-slate-500 italic">Configure keys for handling payments from Nigerian users via Paystack.</p>
                </div>
                <div className="space-y-6">
                  <div className="grid gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Public Key (Live/Test)</label>
                      <input 
                        type="text" 
                        value={paystackConfig.publicKey}
                        onChange={(e) => setPaystackConfig({...paystackConfig, publicKey: e.target.value})}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-white font-mono placeholder:text-slate-600"
                        placeholder="pk_live_..."
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Secret Key (Strict Private access)</label>
                      <input 
                        type="password" 
                        value={paystackConfig.secretKey}
                        onChange={(e) => setPaystackConfig({...paystackConfig, secretKey: e.target.value})}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-white font-mono placeholder:text-slate-600"
                        placeholder="sk_live_..."
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-4 bg-slate-800/40 p-6 rounded-2xl border border-slate-800">
                    <div className="flex-1">
                      <p className="text-sm font-bold text-white">Enable Gateway</p>
                      <p className="text-xs text-slate-500">Toggle Paystack as an active payment option for your users.</p>
                    </div>
                    <button 
                      onClick={() => setPaystackConfig({...paystackConfig, isEnabled: !paystackConfig.isEnabled})}
                      className={`w-14 h-8 rounded-full relative transition-colors ${paystackConfig.isEnabled ? 'bg-blue-600' : 'bg-slate-700'}`}
                    >
                      <div className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-all ${paystackConfig.isEnabled ? 'left-7' : 'left-1'}`} />
                    </button>
                  </div>
                  <button 
                    disabled={isLoading}
                    onClick={() => saveConfig('config', 'paystack', paystackConfig)}
                    className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-blue-700 disabled:opacity-50 shadow-xl shadow-blue-600/20 active:scale-[0.98] transition-all"
                  >
                    {isLoading ? 'Saving...' : <><Save size={18} /> Update Integration</>}
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'ads' && (
              <div className="max-w-2xl space-y-8 animate-in fade-in slide-in-from-bottom-2">
                <div>
                  <h3 className="text-xl font-bold text-white mb-2">Overlay Ads & Pricing</h3>
                  <p className="text-sm text-slate-500 italic">Manage promotional overlays and calculate premium upgrade costs.</p>
                </div>
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Ad Stream Overlay URL</label>
                    <input 
                      type="text" 
                      value={adsConfig.adOverlayUrl}
                      onChange={(e) => setAdsConfig({...adsConfig, adOverlayUrl: e.target.value})}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-white placeholder:text-slate-600"
                      placeholder="https://..."
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Premium Upgrade Price (NGN)</label>
                    <input 
                      type="number" 
                      value={adsConfig.premiumPrice}
                      onChange={(e) => setAdsConfig({...adsConfig, premiumPrice: Number(e.target.value)})}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-white"
                    />
                  </div>
                  <div className="flex items-center gap-4 bg-slate-800/40 p-6 rounded-2xl border border-slate-800">
                    <div className="flex-1">
                      <p className="text-sm font-bold text-white">Enable Global Ads</p>
                      <p className="text-xs text-slate-500">If checked, ad-overlays will show for free-tier users.</p>
                    </div>
                    <button 
                      onClick={() => setAdsConfig({...adsConfig, adsEnabled: !adsConfig.adsEnabled})}
                      className={`w-14 h-8 rounded-full relative transition-colors ${adsConfig.adsEnabled ? 'bg-blue-600' : 'bg-slate-700'}`}
                    >
                      <div className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-all ${adsConfig.adsEnabled ? 'left-7' : 'left-1'}`} />
                    </button>
                  </div>
                  <button 
                    disabled={isLoading}
                    onClick={() => saveConfig('config', 'global', adsConfig)}
                    className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-blue-700 disabled:opacity-50 shadow-xl shadow-blue-600/20 active:scale-[0.98] transition-all"
                  >
                    {isLoading ? 'Saving...' : <><Save size={18} /> Update Content Engine</>}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
