/**
 * Yahoo Finance 歷史資料服務
 * 從 Yahoo Finance API 抓取 ^TWII (加權指數) 和 00631L.TW (ETF) 的歷史資料
 */

export interface HistoricalData {
    date: string;       // YYYY-MM-DD
    indexPrice: number; // ^TWII 加權指數收盤價
    etfPrice: number;   // 00631L ETF 收盤價
}

interface YahooChartResponse {
    chart: {
        result?: Array<{
            timestamp: number[];
            indicators: {
                quote: Array<{
                    close: (number | null)[];
                }>;
                adjclose?: Array<{
                    adjclose: (number | null)[];
                }>;
            };
        }>;
        error?: {
            code: string;
            description: string;
        };
    };
}

// CORS Proxies (same as priceService)
const CORS_PROXIES = [
    'https://corsproxy.io/?',
    'https://api.codetabs.com/v1/proxy?quest=',
];

const SYMBOLS = {
    taiex: '^TWII',
    etf: '00631L.TW'
};

// LocalStorage key for caching
const CACHE_KEY = 'tw50plus2_historical_cache_v1';

interface CacheData {
    data: HistoricalData[];
    lastUpdate: string;
    startDate: string;
    endDate: string;
}

/**
 * 從 Yahoo Finance 抓取單一股票的歷史資料
 */
async function fetchYahooHistorical(
    symbol: string,
    startDate: string,
    endDate: string
): Promise<Map<string, number> | null> {
    // Convert date strings to Unix timestamps
    const period1 = Math.floor(new Date(startDate).getTime() / 1000);
    const period2 = Math.floor(new Date(endDate).getTime() / 1000) + 86400; // Add one day to include end date

    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${period1}&period2=${period2}&interval=1d&events=history`;

    for (const proxy of CORS_PROXIES) {
        try {
            const proxyUrl = `${proxy}${encodeURIComponent(yahooUrl)}`;
            
            const response = await fetch(proxyUrl, {
                headers: {
                    'Accept': 'application/json',
                }
            });

            if (!response.ok) {
                console.warn(`Proxy ${proxy} returned status ${response.status}`);
                continue;
            }

            const data: YahooChartResponse = await response.json();

            if (data.chart.error) {
                console.error(`Yahoo API error for ${symbol}:`, data.chart.error);
                continue;
            }

            const result = data.chart.result?.[0];
            if (!result || !result.timestamp || !result.indicators.quote?.[0]) {
                console.warn(`Invalid data structure for ${symbol}`);
                continue;
            }

            const timestamps = result.timestamp;
            // Prefer adjusted close if available, otherwise use close
            const prices = result.indicators.adjclose?.[0]?.adjclose 
                || result.indicators.quote[0].close;

            if (!prices) {
                console.warn(`No price data for ${symbol}`);
                continue;
            }

            // Create date -> price map
            const priceMap = new Map<string, number>();
            timestamps.forEach((ts, idx) => {
                const price = prices[idx];
                if (price !== null && price !== undefined) {
                    const date = new Date(ts * 1000).toISOString().split('T')[0];
                    priceMap.set(date, price);
                }
            });

            console.log(`Fetched ${priceMap.size} data points for ${symbol}`);
            return priceMap;

        } catch (error) {
            console.warn(`Proxy ${proxy} failed for ${symbol}:`, error);
            continue;
        }
    }

    console.error(`All proxies failed for ${symbol}`);
    return null;
}

/**
 * 抓取所有歷史資料 (加權指數 + ETF)
 */
export async function fetchHistoricalData(
    startDate: string = '2015-01-01',
    endDate: string = new Date().toISOString().split('T')[0],
    onProgress?: (message: string) => void
): Promise<HistoricalData[]> {
    onProgress?.('正在連接 Yahoo Finance...');
    
    // Fetch both symbols in parallel
    onProgress?.('正在下載加權指數資料...');
    const [taiexData, etfData] = await Promise.all([
        fetchYahooHistorical(SYMBOLS.taiex, startDate, endDate),
        (async () => {
            onProgress?.('正在下載 00631L 資料...');
            return fetchYahooHistorical(SYMBOLS.etf, startDate, endDate);
        })()
    ]);

    if (!taiexData || !etfData) {
        throw new Error('無法從 Yahoo Finance 取得資料，請稍後再試');
    }

    onProgress?.('正在合併資料...');

    // Merge data - only include dates that have both index and ETF prices
    const mergedData: HistoricalData[] = [];
    
    // Get all dates from both datasets
    const allDates = new Set([...taiexData.keys(), ...etfData.keys()]);
    const sortedDates = Array.from(allDates).sort();

    for (const date of sortedDates) {
        const indexPrice = taiexData.get(date);
        const etfPrice = etfData.get(date);
        
        if (indexPrice !== undefined && etfPrice !== undefined) {
            mergedData.push({
                date,
                indexPrice: Math.round(indexPrice * 100) / 100,
                etfPrice: Math.round(etfPrice * 100) / 100
            });
        }
    }

    onProgress?.(`載入完成！共 ${mergedData.length} 筆資料`);

    // Cache the data
    saveToCache({
        data: mergedData,
        lastUpdate: new Date().toISOString(),
        startDate,
        endDate
    });

    return mergedData;
}

/**
 * 儲存資料到 localStorage 快取
 */
function saveToCache(cacheData: CacheData): void {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
        console.log('Historical data cached successfully');
    } catch (error) {
        console.warn('Failed to cache historical data:', error);
    }
}

/**
 * 從快取取得資料
 */
export function getCachedData(): CacheData | null {
    try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
            return JSON.parse(cached);
        }
    } catch (error) {
        console.warn('Failed to read cache:', error);
    }
    return null;
}

/**
 * 清除快取
 */
export function clearCache(): void {
    localStorage.removeItem(CACHE_KEY);
}

/**
 * 檢查快取是否有效 (今天的資料)
 */
export function isCacheValid(cache: CacheData | null): boolean {
    if (!cache) return false;
    
    const today = new Date().toISOString().split('T')[0];
    const cacheDate = cache.lastUpdate.split('T')[0];
    
    // Cache is valid if it was updated today
    return cacheDate === today;
}

/**
 * 取得日期範圍
 */
export function getDateRangeFromData(data: HistoricalData[]): { minDate: string; maxDate: string } {
    if (data.length === 0) {
        const today = new Date().toISOString().split('T')[0];
        return { minDate: '2015-01-01', maxDate: today };
    }
    return {
        minDate: data[0].date,
        maxDate: data[data.length - 1].date
    };
}
