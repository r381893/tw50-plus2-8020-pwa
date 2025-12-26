import { useState, useEffect } from 'react'
import './App.css'
import { StatCard } from './components/StatCard'
import { AllocationBar } from './components/AllocationBar'
import {
  calculateEtfValue,
  calculateTotalAssets,
  calculateCurrentRatio,
  calculateRebalanceAction,
  calculateEtfPnL,
  generatePnLScenarios,
  SHARES_PER_UNIT
} from './utils/calculations'
import { formatNumber, formatPnL, formatPercent, formatCompactNumber } from './utils/formatters'

// Types
interface Holdings {
  etfShares: number;
  etfCost: number;
  cashAmount: number;
}

interface MarketData {
  indexPrice: number;
  etfPrice: number;
  maValue: number;
}

interface Settings {
  targetRatio: number;
  maPeriod: number;
}

type TabType = 'dashboard' | 'holdings' | 'rebalance' | 'simulation' | 'settings';

// Local Storage Keys
const STORAGE_KEYS = {
  holdings: 'tw50plus2_holdings',
  settings: 'tw50plus2_settings',
  marketData: 'tw50plus2_market'
};

function App() {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Load saved data from localStorage
  const loadFromStorage = <T,>(key: string, defaultValue: T): T => {
    try {
      const saved = localStorage.getItem(key);
      return saved ? JSON.parse(saved) : defaultValue;
    } catch {
      return defaultValue;
    }
  };

  // Holdings state
  const [holdings, setHoldings] = useState<Holdings>(() =>
    loadFromStorage(STORAGE_KEYS.holdings, {
      etfShares: 10,
      etfCost: 180,
      cashAmount: 500000
    })
  );

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
      targetRatio: 0.8,
      maPeriod: 13
    })
  );

  // Save to localStorage when state changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.holdings, JSON.stringify(holdings));
  }, [holdings]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.marketData, JSON.stringify(marketData));
  }, [marketData]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
  }, [settings]);

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

  // Calculations
  const etfValue = calculateEtfValue(holdings.etfShares, marketData.etfPrice);
  const totalAssets = calculateTotalAssets(etfValue, holdings.cashAmount);
  const currentRatio = calculateCurrentRatio(etfValue, totalAssets);
  const { pnl: etfPnl, pnlPercent } = calculateEtfPnL(
    holdings.etfShares,
    marketData.etfPrice,
    holdings.etfCost
  );
  const rebalanceAction = calculateRebalanceAction(
    etfValue,
    holdings.cashAmount,
    marketData.etfPrice,
    settings.targetRatio
  );

  // MA Status
  const maDiff = marketData.indexPrice - marketData.maValue;
  const isAboveMA = maDiff >= 0;

  // PnL Scenarios
  const pnlScenarios = generatePnLScenarios(
    marketData.indexPrice,
    marketData.etfPrice,
    holdings.etfShares,
    holdings.etfCost
  );

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="header-content">
          <h1 className="app-title">
            📊 台灣五十正2 80/20 配置
          </h1>
          <div className="sync-status">
            <span className={`sync-dot ${isOnline ? '' : 'offline'}`}></span>
            <span>{isOnline ? '已連線' : '離線'}</span>
          </div>
        </div>
      </header>

      {/* Navigation Tabs (Desktop) */}
      <nav className="nav-tabs">
        <button
          className={`nav-tab ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          📊 總覽
        </button>
        <button
          className={`nav-tab ${activeTab === 'holdings' ? 'active' : ''}`}
          onClick={() => setActiveTab('holdings')}
        >
          📋 持倉
        </button>
        <button
          className={`nav-tab ${activeTab === 'rebalance' ? 'active' : ''}`}
          onClick={() => setActiveTab('rebalance')}
        >
          ⚖️ 再平衡
        </button>
        <button
          className={`nav-tab ${activeTab === 'simulation' ? 'active' : ''}`}
          onClick={() => setActiveTab('simulation')}
        >
          📈 模擬
        </button>
        <button
          className={`nav-tab ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          ⚙️ 設定
        </button>
      </nav>

      {/* Main Content */}
      <main className="app-main">
        {/* Dashboard Tab */}
        {activeTab === 'dashboard' && (
          <div className="animate-fade-in">
            {/* Stats Grid */}
            <div className="stats-grid">
              <StatCard
                label="加權指數"
                icon="📈"
                value={formatNumber(marketData.indexPrice)}
              />
              <StatCard
                label="00631L"
                icon="💹"
                value={marketData.etfPrice.toFixed(2)}
              />
              <StatCard
                label="ETF 市值"
                icon="💰"
                value={formatCompactNumber(etfValue)}
                subValue={`${holdings.etfShares} 張`}
              />
              <StatCard
                label="現金部位"
                icon="🏦"
                value={formatCompactNumber(holdings.cashAmount)}
                subValue={`${((1 - currentRatio) * 100).toFixed(1)}%`}
              />
              <StatCard
                label="ETF 損益"
                icon={etfPnl >= 0 ? "📈" : "📉"}
                value={formatPnL(etfPnl)}
                subValue={formatPercent(pnlPercent)}
                variant={etfPnl >= 0 ? 'positive' : 'negative'}
              />
              <StatCard
                label="總資產"
                icon="💎"
                value={formatCompactNumber(totalAssets)}
                size="large"
              />
            </div>

            {/* Allocation Bar */}
            <AllocationBar
              currentRatio={currentRatio}
              targetRatio={settings.targetRatio}
            />

            {/* MA Status */}
            <div className={`ma-status-card ${isAboveMA ? 'safe' : 'warning'}`}>
              <div className="ma-status-header">
                <span className="ma-status-title">📈 均線狀態</span>
                <span className="ma-status-badge">
                  {isAboveMA ? '✅ 安全' : '⚠️ 低於均線'}
                </span>
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
            </div>
          </div>
        )}

        {/* Holdings Tab */}
        {activeTab === 'holdings' && (
          <div className="animate-fade-in">
            <div className="input-section">
              <h2 className="section-title">📋 持倉資料</h2>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">00631L 持有張數</label>
                  <input
                    type="number"
                    className="form-input"
                    value={holdings.etfShares}
                    onChange={(e) => setHoldings({ ...holdings, etfShares: Number(e.target.value) })}
                  />
                  <span className="form-hint">= {formatNumber(holdings.etfShares * SHARES_PER_UNIT)} 股</span>
                </div>
                <div className="form-group">
                  <label className="form-label">平均成本價</label>
                  <input
                    type="number"
                    className="form-input"
                    step="0.01"
                    value={holdings.etfCost}
                    onChange={(e) => setHoldings({ ...holdings, etfCost: Number(e.target.value) })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">現金部位</label>
                  <input
                    type="number"
                    className="form-input"
                    value={holdings.cashAmount}
                    onChange={(e) => setHoldings({ ...holdings, cashAmount: Number(e.target.value) })}
                  />
                </div>
              </div>
            </div>

            <div className="input-section">
              <h2 className="section-title">📈 即時價格</h2>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">加權指數</label>
                  <input
                    type="number"
                    className="form-input"
                    value={marketData.indexPrice}
                    onChange={(e) => setMarketData({ ...marketData, indexPrice: Number(e.target.value) })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">00631L 現價</label>
                  <input
                    type="number"
                    className="form-input"
                    step="0.01"
                    value={marketData.etfPrice}
                    onChange={(e) => setMarketData({ ...marketData, etfPrice: Number(e.target.value) })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">{settings.maPeriod}日均線</label>
                  <input
                    type="number"
                    className="form-input"
                    value={marketData.maValue}
                    onChange={(e) => setMarketData({ ...marketData, maValue: Number(e.target.value) })}
                  />
                </div>
              </div>
            </div>

            {/* Summary */}
            <div className="summary-card">
              <div className="summary-row">
                <span>ETF 市值</span>
                <span className="summary-value">{formatNumber(etfValue)}</span>
              </div>
              <div className="summary-row">
                <span>成本總值</span>
                <span className="summary-value">{formatNumber(holdings.etfShares * SHARES_PER_UNIT * holdings.etfCost)}</span>
              </div>
              <div className="summary-row highlight">
                <span>未實現損益</span>
                <span className={`summary-value ${etfPnl >= 0 ? 'positive' : 'negative'}`}>
                  {formatPnL(etfPnl)} ({formatPercent(pnlPercent)})
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Rebalance Tab */}
        {activeTab === 'rebalance' && (
          <div className="animate-fade-in">
            <AllocationBar
              currentRatio={currentRatio}
              targetRatio={settings.targetRatio}
            />

            <div className="input-section">
              <h2 className="section-title">⚖️ 再平衡計算</h2>

              <div className="rebalance-summary">
                <div className="rebalance-item">
                  <span className="rebalance-label">目前 ETF 比例</span>
                  <span className="rebalance-value">{(currentRatio * 100).toFixed(1)}%</span>
                </div>
                <div className="rebalance-item">
                  <span className="rebalance-label">目標比例</span>
                  <span className="rebalance-value">{(settings.targetRatio * 100).toFixed(0)}%</span>
                </div>
                <div className="rebalance-item">
                  <span className="rebalance-label">總資產</span>
                  <span className="rebalance-value">{formatNumber(totalAssets)}</span>
                </div>
              </div>

              <div className={`rebalance-action ${rebalanceAction.action}`}>
                {rebalanceAction.action === 'hold' ? (
                  <div className="rebalance-action-content">
                    <span className="rebalance-action-icon">✅</span>
                    <span className="rebalance-action-text">配置正常，無需調整</span>
                  </div>
                ) : (
                  <div className="rebalance-action-content">
                    <span className="rebalance-action-icon">
                      {rebalanceAction.action === 'buy' ? '📈' : '📉'}
                    </span>
                    <div className="rebalance-action-details">
                      <span className="rebalance-action-title">
                        建議{rebalanceAction.action === 'buy' ? '買進' : '賣出'}
                      </span>
                      <span className="rebalance-action-shares">
                        {rebalanceAction.shares} 張 00631L
                      </span>
                      <span className="rebalance-action-amount">
                        約 {formatNumber(rebalanceAction.amount)} 元
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* After rebalance preview */}
              {rebalanceAction.action !== 'hold' && (
                <div className="rebalance-preview">
                  <h3 className="preview-title">調整後預覽</h3>
                  <div className="preview-grid">
                    <div className="preview-item">
                      <span className="preview-label">ETF 張數</span>
                      <span className="preview-value">
                        {holdings.etfShares} → {holdings.etfShares + (rebalanceAction.action === 'buy' ? rebalanceAction.shares : -rebalanceAction.shares)}
                      </span>
                    </div>
                    <div className="preview-item">
                      <span className="preview-label">ETF 比例</span>
                      <span className="preview-value">
                        {(currentRatio * 100).toFixed(1)}% → {(settings.targetRatio * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Simulation Tab */}
        {activeTab === 'simulation' && (
          <div className="animate-fade-in">
            <div className="input-section">
              <h2 className="section-title">📈 損益模擬表</h2>
              <p className="section-desc">
                模擬指數波動 ±1500 點對 ETF 損益的影響
              </p>

              <div className="pnl-table-container">
                <table className="pnl-table">
                  <thead>
                    <tr>
                      <th>指數</th>
                      <th>變動</th>
                      <th>ETF 損益</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pnlScenarios.map((scenario, idx) => (
                      <tr
                        key={idx}
                        className={scenario.delta === 0 ? 'highlight-row' : ''}
                      >
                        <td>{formatNumber(scenario.indexPrice)}</td>
                        <td className={scenario.delta >= 0 ? 'text-success' : 'text-danger'}>
                          {scenario.delta >= 0 ? '+' : ''}{scenario.delta}
                        </td>
                        <td className={scenario.etfPnL >= 0 ? 'text-success' : 'text-danger'}>
                          {formatPnL(Math.round(scenario.etfPnL))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="animate-fade-in">
            <div className="input-section">
              <h2 className="section-title">⚙️ 配置設定</h2>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">目標 ETF 配置比例 (%)</label>
                  <input
                    type="number"
                    className="form-input"
                    min="50"
                    max="100"
                    value={settings.targetRatio * 100}
                    onChange={(e) => setSettings({ ...settings, targetRatio: Number(e.target.value) / 100 })}
                  />
                  <span className="form-hint">現金比例: {((1 - settings.targetRatio) * 100).toFixed(0)}%</span>
                </div>
                <div className="form-group">
                  <label className="form-label">均線天數</label>
                  <input
                    type="number"
                    className="form-input"
                    min="5"
                    max="200"
                    value={settings.maPeriod}
                    onChange={(e) => setSettings({ ...settings, maPeriod: Number(e.target.value) })}
                  />
                </div>
              </div>
            </div>

            <div className="input-section">
              <h2 className="section-title">💾 資料管理</h2>
              <div className="button-group">
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    const data = { holdings, marketData, settings };
                    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `tw50plus2_backup_${new Date().toISOString().split('T')[0]}.json`;
                    a.click();
                  }}
                >
                  📥 匯出資料
                </button>
                <button
                  className="btn btn-danger"
                  onClick={() => {
                    if (confirm('確定要清除所有資料嗎？')) {
                      localStorage.clear();
                      location.reload();
                    }
                  }}
                >
                  🗑️ 清除資料
                </button>
              </div>
            </div>

            <div className="app-info">
              <p>台灣五十正2 80/20 配置 PWA</p>
              <p className="text-muted">版本 1.0.0</p>
            </div>
          </div>
        )}
      </main>

      {/* Bottom Navigation (Mobile) */}
      <nav className="bottom-nav">
        <div className="bottom-nav-items">
          <button
            className={`bottom-nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" />
            </svg>
            <span>總覽</span>
          </button>
          <button
            className={`bottom-nav-item ${activeTab === 'holdings' ? 'active' : ''}`}
            onClick={() => setActiveTab('holdings')}
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14H5v-2h7v2zm7-4H5v-2h14v2zm0-4H5V7h14v2z" />
            </svg>
            <span>持倉</span>
          </button>
          <button
            className={`bottom-nav-item ${activeTab === 'rebalance' ? 'active' : ''}`}
            onClick={() => setActiveTab('rebalance')}
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 3v18l-5-4h-3c-1.1 0-2-.9-2-2v-6c0-1.1.9-2 2-2h3l5-4zm6.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
            </svg>
            <span>再平衡</span>
          </button>
          <button
            className={`bottom-nav-item ${activeTab === 'simulation' ? 'active' : ''}`}
            onClick={() => setActiveTab('simulation')}
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M3.5 18.5l6-6 4 4L22 6.92 20.59 5.5l-7.09 8-4-4L2 17l1.5 1.5z" />
            </svg>
            <span>模擬</span>
          </button>
          <button
            className={`bottom-nav-item ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
            </svg>
            <span>設定</span>
          </button>
        </div>
      </nav>
    </div>
  )
}

export default App
