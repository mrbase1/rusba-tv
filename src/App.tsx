/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { 
  Tv, 
  Search, 
  Heart, 
  Settings, 
  Menu, 
  X, 
  User, 
  Crown, 
  Video, 
  Radio,
  Bell,
  Cast,
  LayoutGrid,
  List as ListIcon,
  ShieldCheck,
  ShieldAlert
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth, signIn, logout, db } from './lib/firebase';
import { handleFirestoreError, OperationType } from './lib/firestoreErrorHandler';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, onSnapshot, query, where, addDoc, deleteDoc } from 'firebase/firestore';
import { Channel, parseM3U } from './services/iptvService';
import { Player } from './components/Player';
import { AdminDashboard } from './components/AdminDashboard';
import { Pricing } from './components/Pricing';

const DEFAULT_M3U = 'https://iptv-org.github.io/iptv/index.m3u';

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [adsConfig, setAdsConfig] = useState<any>(null);
  const [showAdOverlay, setShowAdOverlay] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [epgData, setEpgData] = useState<Record<string, any[]>>({});
  const [currentEPG, setCurrentEPG] = useState<any[]>([]);
  const [showAdminDashboard, setShowAdminDashboard] = useState(false);
  const [featuredIds, setFeaturedIds] = useState<Set<string>>(new Set());
  const [showPricing, setShowPricing] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [isTvMode, setIsTvMode] = useState(false);
  const channelListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const userPath = `users/${u.uid}`;
        try {
          const userDoc = await getDoc(doc(db, userPath));
          if (userDoc.exists()) {
            setUserProfile(userDoc.data());
          } else {
            const newProfile = {
              uid: u.uid,
              email: u.email,
              displayName: u.displayName,
              role: 'user',
              subscriptionTier: 'free',
              createdAt: new Date().toISOString()
            };
            await setDoc(doc(db, userPath), newProfile);
            setUserProfile(newProfile);
          }
        } catch (error: any) {
          // If offline, don't crash the app with a fatal throw, just log it.
          // The SDK will sync the setDoc if it's a transient connection issue.
          if (error?.message?.includes('offline') || error?.code === 'unavailable') {
            console.warn("Firestore appears to be offline. Profile sync will retry automatically.");
          } else {
            handleFirestoreError(error, OperationType.WRITE, userPath);
          }
        }

        // Sync Favorites
        const favPath = `users/${u.uid}/favorites`;
        const favQuery = query(collection(db, favPath));
        onSnapshot(favQuery, (snapshot) => {
          const favIds = new Set(snapshot.docs.map(d => d.data().channelId));
          setFavorites(favIds);
        }, (error) => {
          handleFirestoreError(error, OperationType.LIST, favPath);
        });
      } else {
        setUserProfile(null);
        setFavorites(new Set());
      }
    });

    // Fetch Ads/Config
    const configPath = 'config/global';
    onSnapshot(doc(db, configPath), (doc) => {
      if (doc.exists()) {
        setAdsConfig(doc.data());
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, configPath);
    });

    // Load Channels
    const loadChannels = async () => {
      setIsLoading(true);
      const data = await parseM3U(DEFAULT_M3U);
      setChannels(data);
      if (data.length > 0) setSelectedChannel(data[0]);
      setIsLoading(false);
    };

    loadChannels();

    // Sync Featured Channels
    const featUnsub = onSnapshot(collection(db, 'featuredChannels'), (snapshot) => {
      setFeaturedIds(new Set(snapshot.docs.map(d => d.id)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'featuredChannels');
    });

    return () => {
      unsubAuth();
      featUnsub();
    };
  }, []);

  // Update current EPG when selected channel changes
  useEffect(() => {
    if (selectedChannel) {
      // In a real app, I'd look up epgData[selectedChannel.id]
      // We are removing mock data as per user request
      setCurrentEPG([]);
    }
  }, [selectedChannel]);

  const filteredChannels = useMemo(() => {
    return channels.filter(ch => {
      const matchesSearch = ch.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = 
        activeCategory === 'All' || 
        (activeCategory === 'Favorites' ? favorites.has(ch.id) : 
         activeCategory === 'Featured' ? featuredIds.has(ch.id) :
         ch.category === activeCategory);
      return matchesSearch && matchesCategory;
    });
  }, [channels, searchQuery, activeCategory, favorites, featuredIds]);

  const categories = useMemo(() => {
    const cats = new Set(channels.map(c => c.category || 'General'));
    const base = ['All', 'Favorites'];
    if (featuredIds.size > 0) base.push('Featured');
    return [...base, ...Array.from(cats)].sort();
  }, [channels, featuredIds]);

  // Scroll focused element into view
  useEffect(() => {
    if (focusedIndex >= 0 && channelListRef.current) {
      const container = channelListRef.current;
      const focusedElement = container.children[focusedIndex] as HTMLElement;
      if (focusedElement) {
        focusedElement.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest'
        });
      }
    }
  }, [focusedIndex]);

  // Keyboard Navigation for TV
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Any keyboard interaction enables "TV Mode" styles
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(e.key)) {
        setIsTvMode(true);
      }

      if (showAdminDashboard || showPricing || showAdOverlay) return;

      switch (e.key) {
        case 'ArrowDown':
          setFocusedIndex(prev => Math.min(prev + (viewMode === 'grid' ? 2 : 1), filteredChannels.length - 1));
          break;
        case 'ArrowUp':
          setFocusedIndex(prev => Math.max(prev - (viewMode === 'grid' ? 2 : 1), 0));
          break;
        case 'ArrowRight':
          if (viewMode === 'grid') {
            setFocusedIndex(prev => Math.min(prev + 1, filteredChannels.length - 1));
          }
          break;
        case 'ArrowLeft':
          if (viewMode === 'grid') {
            setFocusedIndex(prev => Math.max(prev - 1, 0));
          }
          break;
        case 'Enter':
          if (focusedIndex >= 0 && focusedIndex < filteredChannels.length) {
            setSelectedChannel(filteredChannels[focusedIndex]);
          }
          break;
        case 'Escape':
          setIsSidebarOpen(prev => !prev);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredChannels, focusedIndex, viewMode, showAdminDashboard, showPricing, showAdOverlay]);

  // Reset focus when category or search changes
  useEffect(() => {
    setFocusedIndex(-1);
  }, [activeCategory, searchQuery]);

  const toggleFavorite = async (channel: Channel) => {
    if (!user) {
      alert("Please sign in to save favorites.");
      return;
    }
    const isFav = favorites.has(channel.id);
    const favDoc = doc(db, 'users', user.uid, 'favorites', channel.id);
    const favPath = `users/${user.uid}/favorites/${channel.id}`;
    
    try {
      if (isFav) {
        await deleteDoc(favDoc);
      } else {
        await setDoc(favDoc, {
          userId: user.uid,
          channelId: channel.id,
          name: channel.name,
          logo: channel.logo,
          url: channel.url,
          createdAt: new Date().toISOString()
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, favPath);
    }
  };

  const handleRecordStop = async (blob: Blob) => {
    if (!user) return;
    // In a real app, I'd upload to Firebase Storage. 
    // Here I'll just simulate by logging and saving metadata.
    console.log("Recording size:", blob.size);
    const recordingUrl = URL.createObjectURL(blob); // This is local only
    
    const recPath = `users/${user.uid}/recordings`;
    try {
      await addDoc(collection(db, recPath), {
        userId: user.uid,
        channelName: selectedChannel?.name || 'Unknown',
        title: `Recording ${new Date().toLocaleString()}`,
        videoUrl: recordingUrl,
        createdAt: new Date().toISOString()
      });
      alert("Recording saved locally for this session!");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, recPath);
    }
  };

  // AD Logic
  useEffect(() => {
    if (userProfile?.subscriptionTier !== 'premium' && adsConfig?.adsEnabled) {
      const interval = setInterval(() => {
        setShowAdOverlay(true);
        setTimeout(() => setShowAdOverlay(false), 5000); // 5 sec ad
      }, 30000); // Every 30 sec for demo
      return () => clearInterval(interval);
    }
  }, [userProfile, adsConfig]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <motion.div 
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          className="text-white"
        >
          <img 
            src="https://res.cloudinary.com/dfsfskmha/image/upload/v1778482307/rusba/rusba-tv-logo-blkbg_plumhb.png" 
            alt="RusbaTV Loading" 
            className="h-16 w-auto object-contain"
            referrerPolicy="no-referrer"
          />
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-blue-500/30">
      {/* PRICING MODAL */}
      <AnimatePresence>
        {showPricing && (
          <Pricing 
            user={user} 
            onClose={() => setShowPricing(false)} 
            onSuccess={() => {
              setShowPricing(false);
              alert("Payment successful! You are now a Premium member. Refreshing your profile...");
            }}
          />
        )}
      </AnimatePresence>

      {/* AD OVERLAY */}
      <AnimatePresence>
        {showAdminDashboard && (
          <AdminDashboard 
            onClose={() => setShowAdminDashboard(false)} 
            availableChannels={channels}
          />
        )}
      </AnimatePresence>

      {/* TV MODE INDICATOR */}
      <AnimatePresence>
        {isTvMode && (
          <motion.div 
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 50, opacity: 0 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[60] bg-blue-600 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-4 text-sm font-bold border border-blue-400"
          >
            <div className="flex items-center gap-2">
              <span className="bg-white/20 px-2 py-1 rounded">↑↓←→</span>
              <span>Navigate</span>
            </div>
            <div className="w-px h-4 bg-white/20" />
            <div className="flex items-center gap-2">
              <span className="bg-white/20 px-2 py-1 rounded">ENTER</span>
              <span>Watch</span>
            </div>
            <button 
              onClick={() => setIsTvMode(false)}
              className="ml-4 p-1 hover:bg-white/20 rounded-full transition-colors"
            >
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* HEADER */}
      <header className="h-16 border-b border-slate-800 flex items-center justify-between px-4 sm:px-8 sticky top-0 bg-slate-950/80 backdrop-blur-md z-50">
        <div className="flex items-center gap-2 sm:gap-4">
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 hover:bg-slate-800 rounded-lg lg:hidden">
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2">
            <img 
              src="https://res.cloudinary.com/dfsfskmha/image/upload/v1778482307/rusba/rusba-tv-logo-blkbg_plumhb.png" 
              alt="RusbaTV Logo" 
              className="h-8 w-auto object-contain"
              referrerPolicy="no-referrer"
            />
            <h1 className="text-xl font-bold tracking-tight text-white hidden md:block">RusbaTV</h1>
          </div>
        </div>

        <div className="flex-1 max-w-xs sm:max-w-xl mx-2 sm:mx-8 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-full py-1.5 pl-9 pr-4 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-white"
          />
        </div>

        <div className="flex items-center gap-2 sm:gap-6">
          <div className="hidden sm:flex items-center gap-2 text-[10px] font-bold tracking-widest text-slate-400 px-3 py-1 border border-slate-800 rounded-full bg-slate-900">
            <Cast size={12} />
            <span className="hidden lg:inline">READY TO CAST</span>
          </div>
          
          {user ? (
            <div className="flex items-center gap-2 sm:gap-4">
              <div className="hidden md:flex flex-col items-end">
                <span className="text-sm font-medium">{user.displayName}</span>
                <span className={`text-[10px] uppercase tracking-wider flex items-center gap-1 ${userProfile?.subscriptionTier === 'premium' ? 'text-yellow-400' : 'text-slate-500 font-bold'}`}>
                  {userProfile?.subscriptionTier === 'premium' && <Crown size={10} />}
                  {userProfile?.subscriptionTier}
                </span>
              </div>
              <button onClick={logout} className="p-2 text-slate-400 hover:text-white transition-colors">
                <User size={20} />
              </button>
            </div>
          ) : (
            <button 
              onClick={signIn}
              className="bg-blue-600 text-white px-3 sm:px-5 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-bold hover:bg-blue-700 transition-all"
            >
              Sign In
            </button>
          )}
          <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 flex-shrink-0 hidden xs:block"></div>
        </div>
      </header>

      <div className="flex h-[calc(100vh-64px)] overflow-hidden relative">
        {/* SIDEBAR OVERLAY FOR MOBILE */}
        <AnimatePresence>
          {isSidebarOpen && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-0 bg-black/60 z-30 lg:hidden"
            />
          )}
        </AnimatePresence>

        {/* SIDEBAR */}
        <aside className={`
          fixed inset-y-0 left-0 z-40 w-64 bg-slate-950 border-r border-slate-800 transform transition-transform duration-300 lg:static lg:translate-x-0 flex flex-col
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}>
          <div className="flex-1 flex flex-col p-6 overflow-y-auto custom-scrollbar">
            <div className="mb-10 space-y-1">
              <p className="text-[10px] text-slate-500 font-bold tracking-widest uppercase mb-4">Main Navigation</p>
              
              <button
                onClick={() => {
                  setActiveCategory('All');
                  if (window.innerWidth < 1024) setIsSidebarOpen(false);
                }}
                className={`
                  w-full text-left px-3 py-2 rounded-md flex items-center gap-3 transition-all text-sm font-medium
                  ${activeCategory === 'All' 
                    ? 'bg-blue-600/10 text-blue-400 border-l-4 border-blue-600 shadow-[inset_4px_0_0_0_#2563eb]' 
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'}
                `}
              >
                <Tv size={18} />
                <span>Live Channels</span>
              </button>

              <button
                onClick={() => {
                  setActiveCategory('Favorites');
                  if (window.innerWidth < 1024) setIsSidebarOpen(false);
                }}
                className={`
                  w-full text-left px-3 py-2 rounded-md flex items-center gap-3 transition-all text-sm font-medium
                  ${activeCategory === 'Favorites' 
                    ? 'bg-blue-600/10 text-blue-400 border-l-4 border-blue-600 shadow-[inset_4px_0_0_0_#2563eb]' 
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'}
                `}
              >
                <Heart size={18} />
                <span>Liked Channels</span>
              </button>

              {featuredIds.size > 0 && (
                <button
                  onClick={() => {
                    setActiveCategory('Featured');
                    if (window.innerWidth < 1024) setIsSidebarOpen(false);
                  }}
                  className={`
                    w-full text-left px-3 py-1.5 rounded-md flex items-center gap-3 transition-all text-sm font-medium
                    ${activeCategory === 'Featured' 
                      ? 'bg-amber-600/10 text-amber-400 border-l-4 border-amber-600 shadow-[inset_4px_0_0_0_#d97706]' 
                      : 'text-slate-400 hover:bg-slate-800 hover:text-white'}
                  `}
                >
                  <Crown size={18} />
                  <span>Featured Picks</span>
                </button>
              )}

              {userProfile?.role === 'admin' && (
                <button 
                  onClick={() => {
                    setShowAdminDashboard(true);
                    if (window.innerWidth < 1024) setIsSidebarOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 mt-4 rounded-md transition-all text-sm font-bold bg-red-600/10 text-red-400 hover:bg-red-600/20 border border-red-600/20"
                >
                  <ShieldAlert size={18} />
                  <span>Admin Dashboard</span>
                </button>
              )}
            </div>

            <div className="space-y-1">
              <p className="text-[10px] text-slate-500 font-bold tracking-widest uppercase mb-4">Categories</p>
              {categories.slice(2).map(cat => (
                <button
                  key={cat}
                  onClick={() => {
                    setActiveCategory(cat);
                    if (window.innerWidth < 1024) setIsSidebarOpen(false);
                  }}
                  className={`
                    w-full text-left px-3 py-2 rounded-md flex items-center gap-3 transition-all text-sm font-medium
                    ${activeCategory === cat 
                      ? 'bg-blue-600/10 text-blue-400 border-l-4 border-blue-600 shadow-[inset_4px_0_0_0_#2563eb]' 
                      : 'text-slate-400 hover:bg-slate-800 hover:text-white'}
                  `}
                >
                  <Radio size={18} />
                  <span className="truncate">{cat}</span>
                </button>
              ))}
            </div>

            <div className="mt-8 space-y-1">
              <p className="text-[10px] text-slate-500 font-bold tracking-widest uppercase mb-4">Gear (Affiliate)</p>
              <a href="#" className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-white transition-colors rounded-md group">
                <Cast size={18} className="group-hover:text-blue-500" />
                <span>Best Chromecast</span>
              </a>
              <a href="#" className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-white transition-colors rounded-md group">
                <Video size={18} className="group-hover:text-emerald-500" />
                <span>4K Android Box</span>
              </a>
            </div>


          </div>

          <div className="p-4 bg-slate-950">
            {userProfile?.subscriptionTier === 'premium' ? (
              <div className="bg-emerald-500/10 rounded-xl p-4 border border-emerald-500/30 flex items-center gap-3">
                <div className="p-2 bg-emerald-500 rounded-lg">
                  <Crown size={16} className="text-white" />
                </div>
                <div>
                  <p className="text-xs font-bold text-emerald-400 uppercase tracking-widest">Premium Active</p>
                  <p className="text-[10px] text-slate-400">Unlimited 4K Access</p>
                </div>
              </div>
            ) : (
              <div className="bg-gradient-to-br from-indigo-900 to-blue-900 rounded-xl p-4 border border-indigo-500/30">
                <p className="text-xs font-semibold text-indigo-300 uppercase tracking-wider mb-1">Premium Access</p>
                <p className="text-sm text-white mb-3">Enjoy ad-free streaming & 4K quality</p>
                <button 
                  onClick={() => {
                    if (!user) {
                      signIn();
                    } else {
                      setShowPricing(true);
                    }
                  }}
                  className="w-full py-2 bg-white text-indigo-900 text-xs font-bold rounded-lg uppercase tracking-tight hover:bg-indigo-50 transition-colors"
                >
                  Upgrade Now
                </button>
              </div>
            )}
          </div>
        </aside>

        {/* MAIN CONTENT AREA */}
        <main className="flex-1 bg-slate-900 flex flex-col overflow-hidden">
          <div className="flex-1 flex flex-col md:grid md:grid-cols-12 gap-0 overflow-hidden min-w-0">
            
            {/* LEFT COLUMN: Player & EPG */}
            <div className="md:col-span-8 flex flex-col h-full overflow-hidden border-r border-slate-800 min-h-0">
              {selectedChannel ? (
                <>
                  {/* Fixed Player Section */}
                  <div className="p-4 sm:p-8 pb-4 flex-shrink-0 bg-slate-900 z-10 border-b border-slate-800/50">
                    <div className="flex items-center justify-between gap-4 mb-4">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-1">Currently Playing</p>
                        <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-3 truncate tracking-tight">
                          {selectedChannel.name}
                          <button 
                            onClick={() => toggleFavorite(selectedChannel)}
                            className={`transition-all hover:scale-110 flex-shrink-0 ${favorites.has(selectedChannel.id) ? 'text-red-500' : 'text-slate-600 hover:text-red-500/50'}`}
                          >
                            <Heart size={20} fill={favorites.has(selectedChannel.id) ? 'currentColor' : 'none'} />
                          </button>
                        </h2>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <div className="flex bg-slate-800 p-1 rounded-lg border border-slate-700">
                          <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:text-white'}`}>
                            <LayoutGrid size={16} />
                          </button>
                          <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:text-white'}`}>
                            <ListIcon size={16} />
                          </button>
                        </div>
                      </div>
                    </div>

                    <Player 
                      url={selectedChannel.url} 
                      onRecordStop={handleRecordStop}
                      adOverlayUrl={adsConfig?.adOverlayUrl}
                      showAd={showAdOverlay}
                      onAdClose={() => setShowAdOverlay(false)}
                    />
                  </div>

                  {/* Scrolling EPG or Channel Info Section */}
                  <div className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-8 custom-scrollbar">
                    {currentEPG.length > 0 ? (
                      <div className="bg-slate-800/30 border border-slate-800 rounded-xl p-4 sm:p-6">
                        <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-6">Program Guide</h3>
                        <div className="space-y-4">
                          {currentEPG.map((item, idx) => (
                            <div key={idx} className="flex items-start gap-3 sm:gap-4">
                              <span className={`w-12 sm:w-16 text-xs sm:text-sm font-mono flex-shrink-0 mt-2 ${item.active ? 'text-blue-500 font-bold' : 'text-slate-600'}`}>{item.time}</span>
                              <div className={`
                                flex-1 min-w-0 p-3 sm:p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 transition-all
                                ${item.active 
                                  ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-600/20' 
                                  : 'bg-slate-800/50 border-slate-700 text-slate-400'}
                              `}>
                                <div className="min-w-0">
                                  <p className="font-bold text-sm truncate">{item.title}</p>
                                  <p className={`text-xs truncate ${item.active ? 'text-blue-100' : 'text-slate-500'}`}>{item.desc}</p>
                                </div>
                                <div className="flex-shrink-0 flex items-center">
                                  {item.active ? (
                                    <span className="text-[10px] font-bold uppercase tracking-widest opacity-80 whitespace-nowrap">Watching Now</span>
                                  ) : (
                                    <button className="text-[10px] font-bold uppercase tracking-widest border border-slate-700 px-3 py-1.5 rounded-lg hover:border-slate-500 transition-colors whitespace-nowrap w-full sm:w-auto">
                                      <Bell size={10} className="inline mr-1" /> Remind
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        <div className="bg-slate-800/30 border border-slate-800 rounded-xl p-6 sm:p-8">
                          <div className="flex flex-col md:flex-row gap-8 items-start">
                            <div className="bg-slate-900 w-32 h-32 rounded-2xl flex-shrink-0 flex items-center justify-center p-4 border border-slate-700">
                              {selectedChannel.logo ? (
                                <img src={selectedChannel.logo} alt={selectedChannel.name} className="max-w-full max-h-full object-contain" referrerPolicy="no-referrer" />
                              ) : (
                                <Tv size={48} className="text-slate-700" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-3 mb-2">
                                <span className="bg-blue-600 text-white text-[10px] font-black px-2 py-0.5 rounded tracking-tighter">HD</span>
                                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{selectedChannel.category}</span>
                              </div>
                              <h3 className="text-2xl font-bold text-white mb-4 tracking-tight">{selectedChannel.name}</h3>
                              <p className="text-slate-400 text-sm leading-relaxed mb-6">
                                Streaming live from the global IPTV network. This channel provides continuous high-definition content in the {selectedChannel.category?.toLowerCase() || 'general'} category. Use the recording feature to capture your favorite segments.
                              </p>
                              
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-800">
                                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">Quality</p>
                                  <p className="text-xs font-mono text-white">1080p / 60fps</p>
                                </div>
                                <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-800">
                                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">Status</p>
                                  <p className="text-xs font-mono text-emerald-400 flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                                    ONLINE
                                  </p>
                                </div>
                                <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-800">
                                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">Format</p>
                                  <p className="text-xs font-mono text-white">H.264 / AAC</p>
                                </div>
                                <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-800">
                                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">Latency</p>
                                  <p className="text-xs font-mono text-white">1.2s (Stable)</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                        
                        <div className="bg-blue-600/10 border border-blue-500/20 rounded-xl p-6">
                          <h4 className="text-sm font-bold text-blue-400 flex items-center gap-2 mb-2">
                            <ShieldCheck size={16} />
                            Verified Steam Source
                          </h4>
                          <p className="text-xs text-slate-400 leading-relaxed">
                            This stream is part of the curated {selectedChannel.category} collection. If you experience buffering, try switching your network or check your local bandwidth. Program guide information is currently unavailable for this source.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-slate-500">
                  <p>Select a channel to start watching</p>
                </div>
              )}
            </div>

            {/* RIGHT COLUMN: Trending/Channel List */}
            <div className="md:col-span-4 flex flex-col h-full bg-slate-900/50 min-h-0">
              <div className="p-6 pb-2 flex-shrink-0">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest truncate">
                    {activeCategory} Channels
                  </h3>
                  <span className="text-xs font-mono text-slate-600 bg-slate-800 px-2 py-0.5 rounded">
                    {filteredChannels.length}
                  </span>
                </div>
              </div>
              
              <div 
                ref={channelListRef}
                className={`
                flex-1 overflow-y-auto px-6 pb-8 custom-scrollbar min-h-0
                ${viewMode === 'grid' ? 'grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 md:grid-cols-2 gap-3' : 'space-y-2'}
              `}>
                {filteredChannels.map((ch, index) => (
                  <motion.div
                    key={ch.id}
                    layout
                    onClick={() => {
                      setSelectedChannel(ch);
                      setFocusedIndex(index);
                    }}
                    className={`
                      group relative flex transition-all text-left outline-none cursor-pointer
                      ${viewMode === 'grid' ? 'flex-col bg-slate-800 border border-slate-700 p-3 rounded-xl hover:border-blue-500' : 'flex-row items-center gap-4 p-3 bg-slate-800/40 border border-transparent rounded-xl hover:bg-slate-800 hover:border-slate-700'}
                      ${selectedChannel?.id === ch.id 
                        ? 'border-blue-600 ring-1 ring-blue-600/50 bg-slate-800 shadow-lg shadow-blue-600/10' 
                        : ''}
                      ${focusedIndex === index 
                        ? 'ring-4 ring-blue-500 ring-offset-2 ring-offset-slate-900 border-blue-500 scale-[1.05] z-20 shadow-[0_0_30px_rgba(37,99,235,0.4)]' 
                        : ''}
                    `}
                  >
                    <div className={`
                      bg-slate-700 rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0 transition-transform group-hover:scale-[1.02]
                      ${viewMode === 'grid' ? 'w-full aspect-square mb-2 p-4' : 'w-12 h-12 p-2'}
                    `}>
                      {ch.logo ? (
                        <img 
                          src={ch.logo} 
                          alt={ch.name} 
                          className="max-w-full max-h-full object-contain" 
                          referrerPolicy="no-referrer" 
                        />
                      ) : (
                        <div className={`font-black text-slate-400 ${viewMode === 'grid' ? 'text-2xl' : 'text-lg'}`}>
                          {ch.name.substring(0, 2).toUpperCase()}
                        </div>
                      )}
                    </div>
                    
                    <div className="min-w-0 flex-1">
                      <p className={`font-bold text-xs truncate ${selectedChannel?.id === ch.id ? 'text-blue-400' : 'text-white'}`}>
                        {ch.name}
                      </p>
                      <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-0.5 truncate">
                        {ch.category}
                      </p>
                    </div>

                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite(ch);
                      }}
                      className={`
                        absolute top-1 right-1 p-1.5 rounded-full transition-all
                        ${favorites.has(ch.id) ? 'text-red-500' : 'text-slate-700 opacity-0 group-hover:opacity-100 hover:text-red-500/50'}
                      `}
                    >
                      <Heart size={14} fill={favorites.has(ch.id) ? 'currentColor' : 'none'} />
                    </button>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

