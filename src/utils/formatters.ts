/**
 * 格式化工具函數
 */

/**
 * 格式化數字 (加入千分位)
 */
export function formatNumber(num: number, decimals: number = 0): string {
    return num.toLocaleString('zh-TW', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}

/**
 * 格式化貨幣
 */
export function formatCurrency(num: number, decimals: number = 0): string {
    return `$${formatNumber(num, decimals)}`;
}

/**
 * 格式化百分比
 */
export function formatPercent(num: number, decimals: number = 1): string {
    return `${num >= 0 ? '+' : ''}${num.toFixed(decimals)}%`;
}

/**
 * 格式化損益 (帶正負號)
 */
export function formatPnL(num: number, decimals: number = 0): string {
    const sign = num >= 0 ? '+' : '';
    return `${sign}${formatNumber(num, decimals)}`;
}

/**
 * 格式化股價
 */
export function formatPrice(num: number): string {
    return num.toFixed(2);
}

/**
 * 格式化指數點數
 */
export function formatPoints(num: number): string {
    return formatNumber(Math.round(num), 0);
}

/**
 * 格式化日期
 */
export function formatDate(date: Date): string {
    return date.toLocaleDateString('zh-TW', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
}

/**
 * 格式化時間
 */
export function formatTime(date: Date): string {
    return date.toLocaleTimeString('zh-TW', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * 格式化日期時間
 */
export function formatDateTime(date: Date): string {
    return `${formatDate(date)} ${formatTime(date)}`;
}

/**
 * 簡化大數字 (如 1,850,000 -> 185萬)
 */
export function formatCompactNumber(num: number): string {
    const absNum = Math.abs(num);
    const sign = num < 0 ? '-' : '';

    if (absNum >= 100000000) {
        return `${sign}${(absNum / 100000000).toFixed(1)}億`;
    } else if (absNum >= 10000) {
        return `${sign}${(absNum / 10000).toFixed(1)}萬`;
    } else {
        return `${sign}${formatNumber(absNum)}`;
    }
}
