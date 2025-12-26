/**
 * 台灣五十正2 80/20 配置 - 計算邏輯
 */

// 常數設定
export const LEVERAGE = 2; // 00631L 槓桿倍數
export const DEFAULT_TARGET_RATIO = 0.8; // 預設 80% 配置在 00631L
export const SHARES_PER_UNIT = 1000; // 每張 = 1000 股

/**
 * 計算 ETF 市值
 */
export function calculateEtfValue(shares: number, price: number): number {
    return shares * SHARES_PER_UNIT * price;
}

/**
 * 計算總資產
 */
export function calculateTotalAssets(etfValue: number, cashValue: number): number {
    return etfValue + cashValue;
}

/**
 * 計算目前配置比例
 */
export function calculateCurrentRatio(etfValue: number, totalAssets: number): number {
    if (totalAssets === 0) return 0;
    return etfValue / totalAssets;
}

/**
 * 計算配置偏差
 */
export function calculateDeviation(currentRatio: number, targetRatio: number): number {
    return currentRatio - targetRatio;
}

/**
 * 計算再平衡建議
 * @returns 正數 = 買入張數, 負數 = 賣出張數
 */
export function calculateRebalanceAction(
    etfValue: number,
    cashValue: number,
    etfPrice: number,
    targetRatio: number
): { action: 'buy' | 'sell' | 'hold'; shares: number; amount: number } {
    const totalAssets = etfValue + cashValue;
    const targetEtfValue = totalAssets * targetRatio;
    const difference = targetEtfValue - etfValue;

    // 差異小於 1 萬不交易
    const minTradeThreshold = 10000;

    if (Math.abs(difference) < minTradeThreshold) {
        return { action: 'hold', shares: 0, amount: 0 };
    }

    const sharesToTrade = Math.abs(difference) / (SHARES_PER_UNIT * etfPrice);
    const roundedShares = Math.round(sharesToTrade);

    if (difference > 0) {
        return {
            action: 'buy',
            shares: roundedShares,
            amount: roundedShares * SHARES_PER_UNIT * etfPrice
        };
    } else {
        return {
            action: 'sell',
            shares: roundedShares,
            amount: roundedShares * SHARES_PER_UNIT * etfPrice
        };
    }
}

/**
 * 計算均線
 */
export function calculateMA(prices: number[], period: number): number | null {
    if (prices.length < period) return null;
    const recentPrices = prices.slice(-period);
    return recentPrices.reduce((sum, p) => sum + p, 0) / period;
}

/**
 * 判斷均線狀態
 */
export function getMAStatus(
    currentPrice: number,
    maValue: number | null
): { status: 'above' | 'below' | 'unknown'; diff: number } {
    if (maValue === null) {
        return { status: 'unknown', diff: 0 };
    }
    const diff = currentPrice - maValue;
    return {
        status: diff >= 0 ? 'above' : 'below',
        diff
    };
}

/**
 * 計算 ETF 損益
 */
export function calculateEtfPnL(
    shares: number,
    currentPrice: number,
    costPrice: number
): { pnl: number; pnlPercent: number } {
    const currentValue = shares * SHARES_PER_UNIT * currentPrice;
    const costValue = shares * SHARES_PER_UNIT * costPrice;
    const pnl = currentValue - costValue;
    const pnlPercent = costValue > 0 ? (pnl / costValue) * 100 : 0;
    return { pnl, pnlPercent };
}

/**
 * 生成損益模擬情境
 */
export function generatePnLScenarios(
    baseIndexPrice: number,
    etfPrice: number,
    etfShares: number,
    etfCost: number,
    range: number = 1500,
    step: number = 100
): Array<{
    indexPrice: number;
    delta: number;
    etfPnL: number;
    totalPnL: number;
}> {
    const scenarios: Array<{
        indexPrice: number;
        delta: number;
        etfPnL: number;
        totalPnL: number;
    }> = [];

    for (let delta = -range; delta <= range; delta += step) {
        const newIndexPrice = baseIndexPrice + delta;

        // 指數變動比例
        const indexChange = delta / baseIndexPrice;

        // ETF 價格變動 (2倍槓桿)
        const leveragedChange = indexChange * LEVERAGE;
        const newEtfPrice = etfPrice * (1 + leveragedChange);

        // ETF 損益
        const newEtfValue = etfShares * SHARES_PER_UNIT * newEtfPrice;
        const costValue = etfShares * SHARES_PER_UNIT * etfCost;
        const etfPnL = newEtfValue - costValue;

        scenarios.push({
            indexPrice: newIndexPrice,
            delta,
            etfPnL,
            totalPnL: etfPnL // 純 ETF 策略，無避險
        });
    }

    return scenarios;
}

/**
 * 計算配置健康狀態
 */
export function getAllocationHealth(
    deviation: number
): { status: 'excellent' | 'good' | 'warning' | 'danger'; message: string } {
    const absDeviation = Math.abs(deviation * 100);

    if (absDeviation <= 2) {
        return { status: 'excellent', message: '配置最佳' };
    } else if (absDeviation <= 5) {
        return { status: 'good', message: '配置正常' };
    } else if (absDeviation <= 10) {
        return { status: 'warning', message: '建議再平衡' };
    } else {
        return { status: 'danger', message: '需要再平衡' };
    }
}
