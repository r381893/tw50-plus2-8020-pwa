import { useState, useEffect, useCallback } from 'react'
import './App.css'
import { StatCard } from './components/StatCard'
import { AllocationBar } from './components/AllocationBar'
import {
  calculateInitialAllocation,
  calculateHedgeContracts,
  calculateHedgeStatus,
  calculateHedgePnL,
  SHARES_PER_UNIT
} from './utils/calculations'
import { formatNumber, formatPnL, formatCompactNumber } from './utils/formatters'
import { fetchAllPrices } from './services/priceService'
import { runBacktest, getDateRange } from './services/backtestService'
import type { BacktestResult } from './services/backtestService'
import historicalData from './data/historicalData.json'

// Types
interface MarketData {
  indexPrice: number;
  etfPrice: number;
  maValue: number;
}

interface Settings {
  initialCapital: number;
  targetRatio: number;
  maPeriod: number;
  marginPerContract: number;
  safetyMultiplier: number;
}

interface HedgePosition {
  isActive: boolean;
  contracts: number;
  entryPrice: number;
}

// Portfolio state from backtest
interface Portfolio {
  etfShares: number;
  hedgeCapital: number;
  fromBacktest: boolean;
  backtestStartDate?: string;
}

type TabType = 'dashboard' | 'holdings' | 'hedge' | 'backtest' | 'settings';

// Local Storage Keys - v4 to add portfolio
const STORAGE_KEYS = {
  settings: 'tw50plus2_settings_v4',
  marketData: 'tw50plus2_market_v4',
  hedgePosition: 'tw50plus2_hedge_v4',
  portfolio: 'tw50plus2_portfolio_v4'
};

function App() {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isFetching, setIsFetching] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Load saved data from localStorage
  const loadFromStorage = <T,>(key: string, defaultValue: T): T => {
    try {
      const saved = localStorage.getItem(key);
      return saved ? JSON.parse(saved) : defaultValue;
    } catch {
      return defaultValue;
    }
  };

  // Market data state
  const [marketData, setMarketData] = useState<MarketData>(() =>
    loadFromStorage(STORAGE_KEYS.marketData, {
      indexPrice: 22500,
      etfPrice: 185.5,
      maValue: 22380
    })
  );

  // Settings state
  const [settings, setSettings] = useState<Settings>(() =>
    loadFromStorage(STORAGE_KEYS.settings, {
      initialCapital: 1000000,
      targetRatio: 0.8,
      maPeriod: 13,
      marginPerContract: 85000,
      safetyMultiplier: 2.0  // Changed from 3.0 to 2.0 so hedging is possible
    })
  );

  // Hedge position state
  const [hedgePosition, setHedgePosition] = useState<HedgePosition>(() =>
    loadFromStorage(STORAGE_KEYS.hedgePosition, {
      isActive: false,
      contracts: 0,
      entryPrice: 0
    })
  );

  // Backtest state
  const dateRange = getDateRange(historicalData);
  const [backtestStartDate, setBacktestStartDate] = useState(dateRange.minDate);
  const [backtestEndDate, setBacktestEndDate] = useState(dateRange.maxDate);
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);
  const [isBacktesting, setIsBacktesting] = useState(false);
  const [enableRebalance, setEnableRebalance] = useState(true);
  const [showTradeLogs, setShowTradeLogs] = useState(false);

  // Portfolio state (from backtest or manual)
  const [portfolio, setPortfolio] = useState<Portfolio>(() =>
    loadFromStorage(STORAGE_KEYS.portfolio, {
      etfShares: 0,
      hedgeCapital: 0,
      fromBacktest: false
    })
  );

  // Save to localStorage when state changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.marketData, JSON.stringify(marketData));
  }, [marketData]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.hedgePosition, JSON.stringify(hedgePosition));
  }, [hedgePosition]);

  useEffect(() => {
    if (portfolio.fromBacktest) {
      localStorage.setItem(STORAGE_KEYS.portfolio, JSON.stringify(portfolio));
    }
  }, [portfolio]);

  // Online status listener
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Fetch real-time prices
  const handleFetchPrices = useCallback(async () => {
    setIsFetching(true);
    try {
      const prices = await fetchAllPrices();
      if (prices) {
        setMarketData(prev => ({
          ...prev,
          indexPrice: Math.round(prices.indexPrice * 100) / 100,
          etfPrice: Math.round(prices.etfPrice * 100) / 100
        }));
        setLastUpdate(prices.timestamp);
      } else {
        alert('無法取得即時價格，請稍後再試');
      }
    } catch (error) {
      console.error('Error fetching prices:', error);
      alert('取得價格失敗');
    } finally {
      setIsFetching(false);
    }
  }, []);

  // Run backtest
  const handleRunBacktest = useCallback(() => {
    setIsBacktesting(true);
    setShowTradeLogs(false);
    try {
      const result = runBacktest(historicalData, {
        startDate: backtestStartDate,
        endDate: backtestEndDate,
        initialCapital: settings.initialCapital,
        etfRatio: settings.targetRatio,
        maPeriod: settings.maPeriod,
        marginPerContract: settings.marginPerContract,
        safetyMultiplier: settings.safetyMultiplier,
        enableRebalance
      });
      setBacktestResult(result);
    } catch (error) {
      console.error('Backtest error:', error);
      alert('回測失敗');
    } finally {
      setIsBacktesting(false);
    }
  }, [backtestStartDate, backtestEndDate, settings, enableRebalance]);

  // ============ CALCULATIONS ============

  // Base allocation calculation (for comparison and settings without backtest)
  const baseAllocation = calculateInitialAllocation(
    settings.initialCapital,
    settings.targetRatio,
    marketData.etfPrice
  );

  // Use portfolio from backtest if available, otherwise use fresh calculation
  const displayEtfShares = portfolio.fromBacktest ? portfolio.etfShares : baseAllocation.etfShares;
  const displayHedgeCapital = portfolio.fromBacktest ? portfolio.hedgeCapital : baseAllocation.hedgeAllocation;
  const displayEtfValue = displayEtfShares * SHARES_PER_UNIT * marketData.etfPrice;

  const hedgeInfo = calculateHedgeContracts(
    displayHedgeCapital,
    settings.marginPerContract,
    settings.safetyMultiplier
  );

  const hedgeStatus = calculateHedgeStatus(
    marketData.indexPrice,
    marketData.maValue
  );

  const hedgePnL = hedgePosition.isActive
    ? calculateHedgePnL(
      hedgePosition.contracts,
      hedgePosition.entryPrice,
      marketData.indexPrice
    )
    : { pnl: 0, pnlPoints: 0 };

  const totalAssets = displayEtfValue + displayHedgeCapital + (hedgePosition.isActive ? hedgePnL.pnl : 0);

  const maDiff = marketData.indexPrice - marketData.maValue;
  const isAboveMA = maDiff >= 0;

  // Apply backtest results to portfolio
  const applyBacktestToPortfolio = useCallback(() => {
    if (backtestResult) {
      const lastDay = backtestResult.dailyResults[backtestResult.dailyResults.length - 1];
      setPortfolio({
        etfShares: lastDay.etfShares,
        hedgeCapital: lastDay.hedgeCapital,
        fromBacktest: true,
        backtestStartDate: backtestResult.summary.startDate
      });
      localStorage.setItem(STORAGE_KEYS.portfolio, JSON.stringify({
        etfShares: lastDay.etfShares,
        hedgeCapital: lastDay.hedgeCapital,
        fromBacktest: true,
        backtestStartDate: backtestResult.summary.startDate
      }));
      setActiveTab('dashboard');
    }
  }, [backtestResult]);

  // Reset portfolio to fresh calculation
  const resetPortfolio = useCallback(() => {
    setPortfolio({
      etfShares: 0,
      hedgeCapital: 0,
      fromBacktest: false
    });
    localStorage.removeItem(STORAGE_KEYS.portfolio);
  }, []);

  const toggleHedge = () => {
    if (hedgePosition.isActive) {
      setHedgePosition({ isActive: false, contracts: 0, entryPrice: 0 });
    } else {
      setHedgePosition({
        isActive: true,
        contracts: hedgeInfo.maxContracts,
        entryPrice: marketData.indexPrice
      });
    }
  };

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="header-content">
          <h1 className="app-title">
            📊 00631L 80/20 避險系統
          </h1>
          <div className="sync-status">
            <span className={`sync-dot ${isOnline ? '' : 'offline'}`}></span>
            <span>{isOnline ? '已連線' : '離線'}</span>
          </div>
        </div>
      </header>

      {/* Navigation Tabs (Desktop) */}
      <nav className="nav-tabs">
        <button className={`nav-tab ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
          📊 總覽
        </button>
        <button className={`nav-tab ${activeTab === 'holdings' ? 'active' : ''}`} onClick={() => setActiveTab('holdings')}>
          📋 持倉
        </button>
        <button className={`nav-tab ${activeTab === 'hedge' ? 'active' : ''}`} onClick={() => setActiveTab('hedge')}>
          🛡️ 避險
        </button>
        <button className={`nav-tab ${activeTab === 'backtest' ? 'active' : ''}`} onClick={() => setActiveTab('backtest')}>
          📈 回測
        </button>
        <button className={`nav-tab ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>
          ⚙️ 設定
        </button>
      </nav>

      {/* Main Content */}
      <main className="app-main">
        {/* Dashboard Tab */}
        {activeTab === 'dashboard' && (
          <div className="animate-fade-in">
            {/* Fetch Price Button */}
            <div className="fetch-price-section">
              <button
                className={`btn btn-primary ${isFetching ? 'loading' : ''}`}
                onClick={handleFetchPrices}
                disabled={isFetching}
              >
                {isFetching ? '⏳ 更新中...' : '🔄 更新即時價格'}
              </button>
              {lastUpdate && (
                <span className="last-update">
                  最後更新: {lastUpdate.toLocaleTimeString()}
                </span>
              )}
            </div>

            {/* Backtest Banner */}
            {portfolio.fromBacktest && (
              <div className="backtest-banner">
                <span>📊 資料來源：回測結果 (起始日 {portfolio.backtestStartDate})</span>
                <button className="btn btn-secondary btn-sm" onClick={resetPortfolio}>
                  重置
                </button>
              </div>
            )}

            {/* Stats Grid */}
            <div className="stats-grid">
              <StatCard label="初始資金" icon="💰" value={formatCompactNumber(settings.initialCapital)} subValue={`${(settings.targetRatio * 100).toFixed(0)}/${((1 - settings.targetRatio) * 100).toFixed(0)} 配置`} />
              <StatCard label="加權指數" icon="📈" value={formatNumber(marketData.indexPrice)} />
              <StatCard label="00631L" icon="💹" value={marketData.etfPrice.toFixed(2)} subValue={`${displayEtfShares} 張`} />
              <StatCard label="ETF 市值" icon="📊" value={formatCompactNumber(displayEtfValue)} subValue={`${(settings.targetRatio * 100).toFixed(0)}%`} />
              <StatCard label="避險資金" icon="🛡️" value={formatCompactNumber(displayHedgeCapital)} subValue={`可做空 ${hedgeInfo.maxContracts} 口`} />
              <StatCard label="總資產" icon="💎" value={formatCompactNumber(totalAssets)} size="large" />
            </div>

            <AllocationBar currentRatio={displayEtfValue / (displayEtfValue + displayHedgeCapital)} targetRatio={settings.targetRatio} />

            {/* MA Status */}
            <div className={`ma-status-card ${isAboveMA ? 'safe' : 'warning'}`}>
              <div className="ma-status-header">
                <span className="ma-status-title">📈 均線狀態</span>
                <span className="ma-status-badge">{isAboveMA ? '✅ 站上均線' : '⚠️ 跌破均線'}</span>
              </div>
              <div className="ma-status-content">
                <div className="ma-status-item">
                  <span className="ma-status-label">{settings.maPeriod}日均線</span>
                  <span className="ma-status-value">{formatNumber(marketData.maValue)}</span>
                </div>
                <div className="ma-status-item">
                  <span className="ma-status-label">現價 vs 均線</span>
                  <span className={`ma-status-value ${isAboveMA ? 'positive' : 'negative'}`}>
                    {maDiff >= 0 ? '+' : ''}{formatNumber(maDiff)} 點
                  </span>
                </div>
              </div>
              <div className="ma-status-action">
                <span className={`action-badge ${hedgeStatus.shouldHedge ? 'warning' : 'safe'}`}>
                  {hedgeStatus.message}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Holdings Tab */}
        {activeTab === 'holdings' && (
          <div className="animate-fade-in">
            <div className="input-section">
              <h2 className="section-title">📊 配置計算結果</h2>
              <div className="summary-card">
                <div className="summary-row"><span>初始資金</span><span className="summary-value">{formatNumber(settings.initialCapital)}</span></div>
                <div className="summary-row"><span>ETF 配置 ({(settings.targetRatio * 100).toFixed(0)}%)</span><span className="summary-value">{formatNumber(baseAllocation.etfAllocation)}</span></div>
                <div className="summary-row"><span>避險配置 ({((1 - settings.targetRatio) * 100).toFixed(0)}%)</span><span className="summary-value">{formatNumber(displayHedgeCapital)}</span></div>
              </div>
            </div>

            <div className="input-section">
              <h2 className="section-title">💹 00631L 部位</h2>
              <div className="summary-card">
                <div className="summary-row"><span>現價</span><span className="summary-value">{marketData.etfPrice.toFixed(2)}</span></div>
                <div className="summary-row highlight"><span>持有張數</span><span className="summary-value">{displayEtfShares} 張</span></div>
                <div className="summary-row"><span>持有股數</span><span className="summary-value">{formatNumber(displayEtfShares * SHARES_PER_UNIT)} 股</span></div>
                <div className="summary-row"><span>ETF 市值</span><span className="summary-value">{formatNumber(displayEtfValue)}</span></div>
              </div>
            </div>

            <div className="input-section">
              <h2 className="section-title">📈 即時價格更新</h2>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">加權指數</label>
                  <input type="number" className="form-input" value={marketData.indexPrice} onChange={(e) => setMarketData({ ...marketData, indexPrice: Number(e.target.value) })} />
                </div>
                <div className="form-group">
                  <label className="form-label">00631L 現價</label>
                  <input type="number" className="form-input" step="0.01" value={marketData.etfPrice} onChange={(e) => setMarketData({ ...marketData, etfPrice: Number(e.target.value) })} />
                </div>
                <div className="form-group">
                  <label className="form-label">{settings.maPeriod}日均線</label>
                  <input type="number" className="form-input" value={marketData.maValue} onChange={(e) => setMarketData({ ...marketData, maValue: Number(e.target.value) })} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Hedge Tab */}
        {activeTab === 'hedge' && (
          <div className="animate-fade-in">
            <div className={`hedge-status-card ${hedgeStatus.shouldHedge ? 'warning' : 'safe'}`}>
              <div className="hedge-status-header">
                <span className="hedge-status-icon">{hedgeStatus.shouldHedge ? '⚠️' : '✅'}</span>
                <div className="hedge-status-text">
                  <span className="hedge-status-title">{hedgeStatus.shouldHedge ? '建議啟動避險' : '無需避險'}</span>
                  <span className="hedge-status-subtitle">{hedgeStatus.message}</span>
                </div>
              </div>
            </div>

            <div className="input-section">
              <h2 className="section-title">🛡️ 避險資訊</h2>
              <div className="summary-card">
                <div className="summary-row"><span>避險資金</span><span className="summary-value">{formatNumber(displayHedgeCapital)}</span></div>
                <div className="summary-row"><span>每口保證金</span><span className="summary-value">{formatNumber(settings.marginPerContract)}</span></div>
                <div className="summary-row"><span>安全倍數</span><span className="summary-value">{settings.safetyMultiplier.toFixed(1)}x</span></div>
                <div className="summary-row highlight"><span>可做空口數</span><span className="summary-value">{hedgeInfo.maxContracts} 口</span></div>
              </div>
            </div>

            <div className="input-section">
              <h2 className="section-title">📍 目前避險部位</h2>
              {hedgePosition.isActive ? (
                <div className="summary-card">
                  <div className="summary-row"><span>做空口數</span><span className="summary-value">{hedgePosition.contracts} 口</span></div>
                  <div className="summary-row"><span>進場點位</span><span className="summary-value">{formatNumber(hedgePosition.entryPrice)}</span></div>
                  <div className="summary-row"><span>現價</span><span className="summary-value">{formatNumber(marketData.indexPrice)}</span></div>
                  <div className="summary-row highlight">
                    <span>浮動損益</span>
                    <span className={`summary-value ${hedgePnL.pnl >= 0 ? 'positive' : 'negative'}`}>
                      {formatPnL(hedgePnL.pnl)} ({hedgePnL.pnlPoints >= 0 ? '+' : ''}{hedgePnL.pnlPoints} 點)
                    </span>
                  </div>
                </div>
              ) : (
                <div className="summary-card"><div className="empty-state"><span>目前無避險部位</span></div></div>
              )}
              <button className={`btn ${hedgePosition.isActive ? 'btn-danger' : 'btn-primary'} btn-full`} onClick={toggleHedge}>
                {hedgePosition.isActive ? `🔴 平倉 ${hedgePosition.contracts} 口空單` : `🟢 做空 ${hedgeInfo.maxContracts} 口`}
              </button>
            </div>
          </div>
        )}

        {/* Backtest Tab */}
        {activeTab === 'backtest' && (
          <div className="animate-fade-in">
            <div className="input-section">
              <h2 className="section-title">📈 歷史回測</h2>
              <p className="section-desc">
                使用 {historicalData.length} 筆歷史資料 ({dateRange.minDate} ~ {dateRange.maxDate})
              </p>

              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">起始日期</label>
                  <input type="date" className="form-input" value={backtestStartDate} min={dateRange.minDate} max={dateRange.maxDate} onChange={(e) => setBacktestStartDate(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">結束日期</label>
                  <input type="date" className="form-input" value={backtestEndDate} min={dateRange.minDate} max={dateRange.maxDate} onChange={(e) => setBacktestEndDate(e.target.value)} />
                </div>
              </div>

              <div className="form-group">
                <label className="checkbox-label">
                  <input type="checkbox" checked={enableRebalance} onChange={(e) => setEnableRebalance(e.target.checked)} />
                  啟用每月再平衡 (根據 {(settings.targetRatio * 100).toFixed(0)}/{((1 - settings.targetRatio) * 100).toFixed(0)} 比例)
                </label>
              </div>

              <button className={`btn btn-primary btn-full ${isBacktesting ? 'loading' : ''}`} onClick={handleRunBacktest} disabled={isBacktesting}>
                {isBacktesting ? '⏳ 回測中...' : '🚀 開始回測'}
              </button>
            </div>

            {/* Backtest Results */}
            {backtestResult && (
              <div className="input-section">
                <h2 className="section-title">📊 回測結果</h2>
                <div className="summary-card">
                  <div className="summary-row"><span>回測期間</span><span className="summary-value">{backtestResult.summary.startDate} ~ {backtestResult.summary.endDate}</span></div>
                  <div className="summary-row"><span>初始資金</span><span className="summary-value">{formatNumber(backtestResult.summary.initialCapital)}</span></div>
                  <div className="summary-row highlight">
                    <span>期末資產</span>
                    <span className="summary-value">{formatNumber(Math.round(backtestResult.summary.finalEquity))}</span>
                  </div>
                  <div className="summary-row highlight">
                    <span>總報酬</span>
                    <span className={`summary-value ${backtestResult.summary.totalReturn >= 0 ? 'positive' : 'negative'}`}>
                      {formatPnL(Math.round(backtestResult.summary.totalReturn))} ({backtestResult.summary.totalReturnPercent.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="summary-row">
                    <span>最大回撤</span>
                    <span className="summary-value text-danger">-{backtestResult.summary.maxDrawdown.toFixed(1)}%</span>
                  </div>
                  <div className="summary-row"><span>避險次數</span><span className="summary-value">{backtestResult.summary.hedgeTrades} 次</span></div>
                  <div className="summary-row">
                    <span>避險損益</span>
                    <span className={`summary-value ${backtestResult.summary.totalHedgePnL >= 0 ? 'positive' : 'negative'}`}>
                      {formatPnL(Math.round(backtestResult.summary.totalHedgePnL))}
                    </span>
                  </div>
                  {backtestResult.summary.rebalanceTrades > 0 && (
                    <div className="summary-row"><span>再平衡次數</span><span className="summary-value">{backtestResult.summary.rebalanceTrades} 次</span></div>
                  )}
                </div>

                {/* Simple equity chart using CSS */}
                <div className="equity-chart">
                  <h3 className="chart-title">📈 資產曲線</h3>
                  <div className="chart-container">
                    {backtestResult.dailyResults.filter((_, i) => i % Math.max(1, Math.floor(backtestResult.dailyResults.length / 50)) === 0).map((day, idx) => {
                      const minEquity = Math.min(...backtestResult.dailyResults.map(d => d.totalEquity));
                      const maxEquity = Math.max(...backtestResult.dailyResults.map(d => d.totalEquity));
                      const height = ((day.totalEquity - minEquity) / (maxEquity - minEquity)) * 100;
                      return (
                        <div key={idx} className="chart-bar" style={{ height: `${height}%` }} title={`${day.date}: ${formatNumber(Math.round(day.totalEquity))}`}>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Trade Log Toggle */}
                <button className="btn btn-secondary btn-full" onClick={() => setShowTradeLogs(!showTradeLogs)}>
                  {showTradeLogs ? '📋 隱藏交易明細' : '📋 顯示交易明細'} ({backtestResult.tradeLogs.length} 筆)
                </button>

                {/* Trade Log Table */}
                {showTradeLogs && (
                  <div className="trade-log-container">
                    <table className="trade-log-table">
                      <thead>
                        <tr>
                          <th>日期</th>
                          <th>類型</th>
                          <th>說明</th>
                          <th>損益</th>
                        </tr>
                      </thead>
                      <tbody>
                        {backtestResult.tradeLogs.map((log, idx) => (
                          <tr key={idx} className={`trade-row trade-${log.type}`}>
                            <td>{log.date}</td>
                            <td>
                              {log.type === 'buy' && '🟢 建倉'}
                              {log.type === 'rebalance' && '⚖️ 再平衡'}
                              {log.type === 'hedge_open' && '🔴 避險'}
                              {log.type === 'hedge_close' && '🟡 平倉'}
                            </td>
                            <td>{log.description}</td>
                            <td className={log.pnl && log.pnl >= 0 ? 'positive' : log.pnl ? 'negative' : ''}>
                              {log.pnl ? formatPnL(Math.round(log.pnl)) : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Apply to Dashboard Button */}
                <button className="btn btn-primary btn-full" onClick={applyBacktestToPortfolio}>
                  ✅ 套用到總覽 (ETF {backtestResult.dailyResults[backtestResult.dailyResults.length - 1].etfShares} 張)
                </button>
              </div>
            )}
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="animate-fade-in">
            <div className="input-section">
              <h2 className="section-title">💰 資金配置</h2>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">初始總資金 (TWD)</label>
                  <input type="number" className="form-input" step="100000" value={settings.initialCapital} onChange={(e) => setSettings({ ...settings, initialCapital: Number(e.target.value) })} />
                </div>
                <div className="form-group">
                  <label className="form-label">ETF 配置比例 (%)</label>
                  <input type="number" className="form-input" min="50" max="95" value={settings.targetRatio * 100} onChange={(e) => setSettings({ ...settings, targetRatio: Number(e.target.value) / 100 })} />
                  <span className="form-hint">避險比例: {((1 - settings.targetRatio) * 100).toFixed(0)}%</span>
                </div>
              </div>
            </div>

            <div className="input-section">
              <h2 className="section-title">🛡️ 避險設定</h2>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">小台保證金 (每口)</label>
                  <input type="number" className="form-input" step="1000" value={settings.marginPerContract} onChange={(e) => setSettings({ ...settings, marginPerContract: Number(e.target.value) })} />
                </div>
                <div className="form-group">
                  <label className="form-label">安全倍數</label>
                  <input type="number" className="form-input" step="0.5" min="1" max="5" value={settings.safetyMultiplier} onChange={(e) => setSettings({ ...settings, safetyMultiplier: Number(e.target.value) })} />
                  <span className="form-hint">每口實際需: {formatNumber(settings.marginPerContract * settings.safetyMultiplier)}</span>
                </div>
                <div className="form-group">
                  <label className="form-label">均線天數</label>
                  <input type="number" className="form-input" min="5" max="200" value={settings.maPeriod} onChange={(e) => setSettings({ ...settings, maPeriod: Number(e.target.value) })} />
                </div>
              </div>
            </div>

            <div className="input-section">
              <h2 className="section-title">💾 資料管理</h2>
              <div className="button-group">
                <button className="btn btn-secondary" onClick={() => {
                  const data = { settings, marketData, hedgePosition };
                  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `tw50plus2_backup_${new Date().toISOString().split('T')[0]}.json`;
                  a.click();
                }}>
                  📥 匯出資料
                </button>
                <button className="btn btn-danger" onClick={() => {
                  if (confirm('確定要清除所有資料嗎？')) {
                    localStorage.clear();
                    location.reload();
                  }
                }}>
                  🗑️ 清除資料
                </button>
              </div>
            </div>

            <div className="app-info">
              <p>00631L 80/20 避險系統 PWA</p>
              <p className="text-muted">版本 2.1.0 (含回測功能)</p>
            </div>
          </div>
        )}
      </main>

      {/* Bottom Navigation (Mobile) */}
      <nav className="bottom-nav">
        <div className="bottom-nav-items">
          <button className={`bottom-nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" /></svg>
            <span>總覽</span>
          </button>
          <button className={`bottom-nav-item ${activeTab === 'holdings' ? 'active' : ''}`} onClick={() => setActiveTab('holdings')}>
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14H5v-2h7v2zm7-4H5v-2h14v2zm0-4H5V7h14v2z" /></svg>
            <span>持倉</span>
          </button>
          <button className={`bottom-nav-item ${activeTab === 'hedge' ? 'active' : ''}`} onClick={() => setActiveTab('hedge')}>
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z" /></svg>
            <span>避險</span>
          </button>
          <button className={`bottom-nav-item ${activeTab === 'backtest' ? 'active' : ''}`} onClick={() => setActiveTab('backtest')}>
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3.5 18.5l6-6 4 4L22 6.92 20.59 5.5l-7.09 8-4-4L2 17l1.5 1.5z" /></svg>
            <span>回測</span>
          </button>
          <button className={`bottom-nav-item ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" /></svg>
            <span>設定</span>
          </button>
        </div>
      </nav>
    </div>
  )
}

export default App
