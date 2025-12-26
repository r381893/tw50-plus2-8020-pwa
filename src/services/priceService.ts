/**
 * Yahoo Finance 即時價格服務
 */

interface PriceData {
    indexPrice: number;
    etfPrice: number;
    timestamp: Date;
}

interface YahooChartResult {
    chart: {
        result: Array<{
            meta: {
                regularMarketPrice: number;
            };
        }>;
    };
}

// Multiple CORS Proxies as fallback
const CORS_PROXIES = [
    'https://corsproxy.io/?',
    'https://api.codetabs.com/v1/proxy?quest=',
    'https://cors-anywhere.herokuapp.com/',
];

const SYMBOLS = {
    taiex: '^TWII',
    etf: '00631L.TW'
};

/**
 * 從 Yahoo Finance 取得即時價格
 */
export async function fetchYahooPrice(symbol: string): Promise<number | null> {
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;

    // Try each proxy in order
    for (const proxy of CORS_PROXIES) {
        try {
            const proxyUrl = `${proxy}${encodeURIComponent(yahooUrl)}`;

            const response = await fetch(proxyUrl, {
                headers: {
                    'Accept': 'application/json',
                }
            });

            if (!response.ok) {
                continue; // Try next proxy
            }

            const data: YahooChartResult = await response.json();

            if (data.chart?.result?.[0]?.meta?.regularMarketPrice) {
                return data.chart.result[0].meta.regularMarketPrice;
            }
        } catch (error) {
            console.warn(`Proxy ${proxy} failed for ${symbol}:`, error);
            continue; // Try next proxy
        }
    }

    console.error(`All proxies failed for ${symbol}`);
    return null;
}

/**
 * 取得所有即時價格
 */
export async function fetchAllPrices(): Promise<PriceData | null> {
    try {
        const [indexPrice, etfPrice] = await Promise.all([
            fetchYahooPrice(SYMBOLS.taiex),
            fetchYahooPrice(SYMBOLS.etf)
        ]);

        if (indexPrice !== null && etfPrice !== null) {
            return {
                indexPrice,
                etfPrice,
                timestamp: new Date()
            };
        }

        return null;
    } catch (error) {
        console.error('Error fetching all prices:', error);
        return null;
    }
}

/**
 * 備用方案：使用本地資料的最後一筆
 */
export function getLatestFromHistorical(
    data: Array<{ date: string; indexPrice: number; etfPrice: number }>
): PriceData | null {
    if (data.length === 0) return null;

    const latest = data[data.length - 1];
    return {
        indexPrice: latest.indexPrice,
        etfPrice: latest.etfPrice,
        timestamp: new Date(latest.date)
    };
}
