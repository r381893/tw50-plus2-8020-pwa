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

// CORS Proxy for Yahoo Finance
const CORS_PROXY = 'https://api.allorigins.win/raw?url=';

const SYMBOLS = {
    taiex: '^TWII',
    etf: '00631L.TW'
};

/**
 * 從 Yahoo Finance 取得即時價格
 */
export async function fetchYahooPrice(symbol: string): Promise<number | null> {
    try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;
        const proxyUrl = `${CORS_PROXY}${encodeURIComponent(url)}`;

        const response = await fetch(proxyUrl);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data: YahooChartResult = await response.json();

        if (data.chart?.result?.[0]?.meta?.regularMarketPrice) {
            return data.chart.result[0].meta.regularMarketPrice;
        }

        return null;
    } catch (error) {
        console.error(`Error fetching price for ${symbol}:`, error);
        return null;
    }
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
