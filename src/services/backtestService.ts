/**
 * 回測邏輯 - 含每月再平衡和交易明細
 */

export interface BacktestParams {
    startDate: string;
    endDate: string;
    initialCapital: number;
    etfRatio: number;
    maPeriod: number;
    marginPerContract: number;
    safetyMultiplier: number;
    enableRebalance: boolean; // 是否啟用每月再平衡
}

export interface TradeLog {
    date: string;
    type: 'buy' | 'sell' | 'hedge_open' | 'hedge_close' | 'rebalance';
    description: string;
    shares?: number;
    contracts?: number;
    price: number;
    amount: number;
    pnl?: number;
    etfSharesAfter: number;
    hedgeCapitalAfter: number;
    totalEquityAfter: number;
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
    tradeLogs: TradeLog[];
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
        rebalanceTrades: number;
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
            ma.push(0);
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
    let rebalanceTrades = 0;
    let lastMonth = new Date(filteredData[0].date).getMonth();

    const dailyResults: DailyResult[] = [];
    const tradeLogs: TradeLog[] = [];
    let maxEquity = params.initialCapital;
    let maxDrawdown = 0;

    // Record initial purchase
    tradeLogs.push({
        date: filteredData[0].date,
        type: 'buy',
        description: `建倉買進 ${initialShares} 張`,
        shares: initialShares,
        price: firstEtfPrice,
        amount: initialShares * 1000 * firstEtfPrice,
        etfSharesAfter: initialShares,
        hedgeCapitalAfter: hedgeCapital,
        totalEquityAfter: params.initialCapital
    });

    for (let i = 0; i < filteredData.length; i++) {
        const { date, indexPrice, etfPrice } = filteredData[i];
        const maValue = maValues[i];
        const currentMonth = new Date(date).getMonth();

        // Calculate ETF value
        let etfValue = etfShares * 1000 * etfPrice;

        // Monthly rebalancing (at month change)
        if (params.enableRebalance && i > 0 && currentMonth !== lastMonth && hedgeContracts === 0) {
            const totalEquity = etfValue + hedgeCapital;
            const targetEtfValue = totalEquity * params.etfRatio;
            const currentEtfValue = etfValue;
            const diff = targetEtfValue - currentEtfValue;

            // Only rebalance if difference is significant (> 1%)
            if (Math.abs(diff) > totalEquity * 0.01) {
                const sharesToTrade = Math.round(diff / (etfPrice * 1000));

                if (sharesToTrade !== 0) {
                    const tradeAmount = Math.abs(sharesToTrade) * 1000 * etfPrice;

                    if (sharesToTrade > 0) {
                        // Buy more ETF
                        etfShares += sharesToTrade;
                        hedgeCapital -= tradeAmount;
                        tradeLogs.push({
                            date,
                            type: 'rebalance',
                            description: `再平衡買進 ${sharesToTrade} 張`,
                            shares: sharesToTrade,
                            price: etfPrice,
                            amount: tradeAmount,
                            etfSharesAfter: etfShares,
                            hedgeCapitalAfter: hedgeCapital,
                            totalEquityAfter: totalEquity
                        });
                    } else {
                        // Sell ETF
                        etfShares += sharesToTrade; // sharesToTrade is negative
                        hedgeCapital += tradeAmount;
                        tradeLogs.push({
                            date,
                            type: 'rebalance',
                            description: `再平衡賣出 ${Math.abs(sharesToTrade)} 張`,
                            shares: sharesToTrade,
                            price: etfPrice,
                            amount: tradeAmount,
                            etfSharesAfter: etfShares,
                            hedgeCapitalAfter: hedgeCapital,
                            totalEquityAfter: totalEquity
                        });
                    }
                    rebalanceTrades++;
                    etfValue = etfShares * 1000 * etfPrice;
                }
            }
        }
        lastMonth = currentMonth;

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

                    tradeLogs.push({
                        date,
                        type: 'hedge_open',
                        description: `跌破均線，做空 ${canShort} 口小台 @ ${indexPrice.toFixed(0)}`,
                        contracts: canShort,
                        price: indexPrice,
                        amount: canShort * params.marginPerContract,
                        etfSharesAfter: etfShares,
                        hedgeCapitalAfter: hedgeCapital,
                        totalEquityAfter: etfValue + hedgeCapital
                    });
                }
            } else if (!isBelowMA && hedgeContracts > 0) {
                // Exit hedge: close short
                const pnlPoints = hedgeEntryPrice - indexPrice;
                dailyHedgePnL = hedgeContracts * pnlPoints * 50; // 小台每點50元
                hedgeCapital += dailyHedgePnL;
                totalHedgePnL += dailyHedgePnL;

                tradeLogs.push({
                    date,
                    type: 'hedge_close',
                    description: `站上均線，平倉 ${hedgeContracts} 口小台 @ ${indexPrice.toFixed(0)}`,
                    contracts: hedgeContracts,
                    price: indexPrice,
                    amount: 0,
                    pnl: dailyHedgePnL,
                    etfSharesAfter: etfShares,
                    hedgeCapitalAfter: hedgeCapital,
                    totalEquityAfter: etfValue + hedgeCapital
                });

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
        tradeLogs,
        summary: {
            startDate: params.startDate,
            endDate: params.endDate,
            initialCapital: params.initialCapital,
            finalEquity,
            totalReturn,
            totalReturnPercent,
            maxDrawdown: maxDrawdown * 100,
            totalHedgePnL,
            hedgeTrades,
            rebalanceTrades
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
