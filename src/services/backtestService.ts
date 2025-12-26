/**
 * 回測邏輯
 */

export interface BacktestParams {
    startDate: string;
    endDate: string;
    initialCapital: number;
    etfRatio: number;
    maPeriod: number;
    marginPerContract: number;
    safetyMultiplier: number;
}

export interface DailyResult {
    date: string;
    indexPrice: number;
    etfPrice: number;
    maValue: number;
    etfShares: number;
    etfValue: number;
    hedgeCapital: number;
    hedgeContracts: number;
    hedgePnL: number;
    totalEquity: number;
    signal: 'long' | 'hedge' | 'none';
}

export interface BacktestResult {
    dailyResults: DailyResult[];
    summary: {
        startDate: string;
        endDate: string;
        initialCapital: number;
        finalEquity: number;
        totalReturn: number;
        totalReturnPercent: number;
        maxDrawdown: number;
        totalHedgePnL: number;
        hedgeTrades: number;
    };
}

interface HistoricalData {
    date: string;
    indexPrice: number;
    etfPrice: number;
}

/**
 * 計算移動平均線
 */
function calculateMA(prices: number[], period: number): number[] {
    const ma: number[] = [];

    for (let i = 0; i < prices.length; i++) {
        if (i < period - 1) {
            ma.push(0); // Not enough data for MA
        } else {
            const slice = prices.slice(i - period + 1, i + 1);
            const avg = slice.reduce((sum, p) => sum + p, 0) / period;
            ma.push(Math.round(avg * 100) / 100);
        }
    }

    return ma;
}

/**
 * 執行回測
 */
export function runBacktest(
    data: HistoricalData[],
    params: BacktestParams
): BacktestResult {
    // Filter data by date range
    const filteredData = data.filter(d =>
        d.date >= params.startDate && d.date <= params.endDate
    );

    if (filteredData.length === 0) {
        throw new Error('No data in selected date range');
    }

    // Calculate MA
    const indexPrices = filteredData.map(d => d.indexPrice);
    const maValues = calculateMA(indexPrices, params.maPeriod);

    // Initialize
    const etfAllocation = params.initialCapital * params.etfRatio;
    const hedgeAllocation = params.initialCapital * (1 - params.etfRatio);

    const firstEtfPrice = filteredData[0].etfPrice;
    const initialShares = Math.floor(etfAllocation / (firstEtfPrice * 1000)); // 張數

    let etfShares = initialShares;
    let hedgeCapital = hedgeAllocation;
    let hedgeContracts = 0;
    let hedgeEntryPrice = 0;
    let totalHedgePnL = 0;
    let hedgeTrades = 0;

    const dailyResults: DailyResult[] = [];
    let maxEquity = params.initialCapital;
    let maxDrawdown = 0;

    for (let i = 0; i < filteredData.length; i++) {
        const { date, indexPrice, etfPrice } = filteredData[i];
        const maValue = maValues[i];

        // Calculate ETF value
        const etfValue = etfShares * 1000 * etfPrice;

        // Determine signal
        const isBelowMA = maValue > 0 && indexPrice < maValue;
        let signal: 'long' | 'hedge' | 'none' = 'none';
        let dailyHedgePnL = 0;

        if (maValue > 0) {
            if (isBelowMA && hedgeContracts === 0) {
                // Enter hedge: short futures
                const effectiveMargin = params.marginPerContract * params.safetyMultiplier;
                const canShort = Math.floor(hedgeCapital / effectiveMargin);
                if (canShort > 0) {
                    hedgeContracts = canShort;
                    hedgeEntryPrice = indexPrice;
                    hedgeTrades++;
                    signal = 'hedge';
                }
            } else if (!isBelowMA && hedgeContracts > 0) {
                // Exit hedge: close short
                const pnlPoints = hedgeEntryPrice - indexPrice;
                dailyHedgePnL = hedgeContracts * pnlPoints * 50; // 小台每點50元
                hedgeCapital += dailyHedgePnL;
                totalHedgePnL += dailyHedgePnL;
                hedgeContracts = 0;
                hedgeEntryPrice = 0;
                signal = 'long';
            } else if (hedgeContracts > 0) {
                signal = 'hedge';
            } else {
                signal = 'long';
            }
        }

        // Calculate unrealized hedge PnL if in position
        let unrealizedHedgePnL = 0;
        if (hedgeContracts > 0) {
            const pnlPoints = hedgeEntryPrice - indexPrice;
            unrealizedHedgePnL = hedgeContracts * pnlPoints * 50;
        }

        // Total equity
        const totalEquity = etfValue + hedgeCapital + unrealizedHedgePnL;

        // Track max drawdown
        if (totalEquity > maxEquity) {
            maxEquity = totalEquity;
        }
        const drawdown = (maxEquity - totalEquity) / maxEquity;
        if (drawdown > maxDrawdown) {
            maxDrawdown = drawdown;
        }

        dailyResults.push({
            date,
            indexPrice,
            etfPrice,
            maValue,
            etfShares,
            etfValue,
            hedgeCapital,
            hedgeContracts,
            hedgePnL: dailyHedgePnL,
            totalEquity,
            signal
        });
    }

    // Calculate summary
    const finalEquity = dailyResults[dailyResults.length - 1].totalEquity;
    const totalReturn = finalEquity - params.initialCapital;
    const totalReturnPercent = (totalReturn / params.initialCapital) * 100;

    return {
        dailyResults,
        summary: {
            startDate: params.startDate,
            endDate: params.endDate,
            initialCapital: params.initialCapital,
            finalEquity,
            totalReturn,
            totalReturnPercent,
            maxDrawdown: maxDrawdown * 100,
            totalHedgePnL,
            hedgeTrades
        }
    };
}

/**
 * 取得可用的日期範圍
 */
export function getDateRange(data: HistoricalData[]): { minDate: string; maxDate: string } {
    if (data.length === 0) {
        return { minDate: '2015-01-01', maxDate: '2025-12-31' };
    }
    return {
        minDate: data[0].date,
        maxDate: data[data.length - 1].date
    };
}
