import parser from 'iptv-playlist-parser';
import { xml2js } from 'xml-js';

export interface Channel {
  id: string;
  name: string;
  logo: string;
  url: string;
  category?: string;
  isPremium?: boolean;
}

export interface EPGProgram {
  start: Date;
  stop: Date;
  title: string;
  description?: string;
}

const M3U_CACHE_KEY = 'rusba_iptv_cache';
const CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours

export async function parseM3U(url: string): Promise<Channel[]> {
  // Check Cache
  try {
    const cached = localStorage.getItem(M3U_CACHE_KEY);
    if (cached) {
      const { data, timestamp, cachedUrl } = JSON.parse(cached);
      const isExpired = Date.now() - timestamp > CACHE_TTL;
      if (!isExpired && cachedUrl === url && Array.isArray(data)) {
        console.log('IPTV: Using cached data');
        return data;
      }
    }
  } catch (e) {
    console.warn('IPTV cache read error:', e);
  }

  try {
    const response = await fetch(url);
    const m3u = await response.text();
    const result = parser.parse(m3u);
    
    const channels = result.items.map((item, index) => {
      const category = item.group.title || 'General';

      return {
        id: item.tvg.id || `channel-${index}`,
        name: item.name || item.tvg.name || 'Unknown Channel',
        logo: item.tvg.logo || '',
        url: item.url,
        category,
        isPremium: false
      };
    });

    // Save to Cache
    try {
      localStorage.setItem(M3U_CACHE_KEY, JSON.stringify({
        data: channels,
        timestamp: Date.now(),
        cachedUrl: url
      }));
    } catch (e) {
      console.warn('IPTV cache write error:', e);
    }

    return channels;
  } catch (error) {
    console.error('Error parsing M3U:', error);
    return [];
  }
}

export async function parseEPG(url: string): Promise<Record<string, EPGProgram[]>> {
  try {
    const response = await fetch(url);
    const xml = await response.text();
    const result = xml2js(xml, { compact: true }) as any;
    
    const programs: Record<string, EPGProgram[]> = {};
    
    if (result.tv && result.tv.programme) {
      const programmeArray = Array.isArray(result.tv.programme) ? result.tv.programme : [result.tv.programme];
      
      programmeArray.forEach((p: any) => {
        const channelId = p._attributes.channel;
        if (!programs[channelId]) programs[channelId] = [];
        
        programs[channelId].push({
          start: parseXmlDate(p._attributes.start),
          stop: parseXmlDate(p._attributes.stop),
          title: p.title._text || p.title._cdata,
          description: p.desc?._text || p.desc?._cdata || ''
        });
      });
    }
    
    return programs;
  } catch (error) {
    console.error('Error parsing EPG:', error);
    return {};
  }
}

function parseXmlDate(dateStr: string): Date {
  // Format: 20231027120000 +0000
  const year = parseInt(dateStr.substring(0, 4));
  const month = parseInt(dateStr.substring(4, 6)) - 1;
  const day = parseInt(dateStr.substring(6, 8));
  const hour = parseInt(dateStr.substring(8, 10));
  const minute = parseInt(dateStr.substring(10, 12));
  const second = parseInt(dateStr.substring(12, 14));
  
  return new Date(Date.UTC(year, month, day, hour, minute, second));
}
