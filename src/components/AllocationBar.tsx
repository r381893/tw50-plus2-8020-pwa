import './AllocationBar.css';

interface AllocationBarProps {
    currentRatio: number;
    targetRatio: number;
    showLabels?: boolean;
}

export function AllocationBar({
    currentRatio,
    targetRatio,
    showLabels = true
}: AllocationBarProps) {
    const currentPercent = currentRatio * 100;
    const targetPercent = targetRatio * 100;
    const deviation = currentPercent - targetPercent;

    // 判斷狀態
    let status: 'excellent' | 'good' | 'warning' | 'danger' = 'good';
    let message = '';

    const absDeviation = Math.abs(deviation);
    if (absDeviation <= 2) {
        status = 'excellent';
        message = '✅ 配置最佳';
    } else if (absDeviation <= 5) {
        status = 'good';
        message = '✅ 配置正常';
    } else if (absDeviation <= 10) {
        status = 'warning';
        message = '⚠️ 建議再平衡';
    } else {
        status = 'danger';
        message = '🔴 需要再平衡';
    }

    return (
        <div className={`allocation-bar allocation-bar--${status}`}>
            <div className="allocation-bar__header">
                <span className="allocation-bar__title">📊 配置狀態</span>
                <span className="allocation-bar__status">{message}</span>
            </div>

            <div className="allocation-bar__track">
                <div
                    className="allocation-bar__fill"
                    style={{ width: `${Math.min(currentPercent, 100)}%` }}
                />
                <div
                    className="allocation-bar__target"
                    style={{ left: `${targetPercent}%` }}
                />
            </div>

            {showLabels && (
                <div className="allocation-bar__labels">
                    <div className="allocation-bar__label">
                        <span className="allocation-bar__label-title">目前</span>
                        <span className="allocation-bar__label-value">{currentPercent.toFixed(1)}%</span>
                    </div>
                    <div className="allocation-bar__label">
                        <span className="allocation-bar__label-title">目標</span>
                        <span className="allocation-bar__label-value">{targetPercent.toFixed(0)}%</span>
                    </div>
                    <div className="allocation-bar__label">
                        <span className="allocation-bar__label-title">偏差</span>
                        <span className={`allocation-bar__label-value ${deviation >= 0 ? 'positive' : 'negative'}`}>
                            {deviation >= 0 ? '+' : ''}{deviation.toFixed(1)}%
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}
