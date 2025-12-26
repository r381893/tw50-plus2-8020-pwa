import { ReactNode } from 'react';
import './StatCard.css';

interface StatCardProps {
    label: string;
    value: string | number;
    subValue?: string;
    icon?: string;
    variant?: 'default' | 'positive' | 'negative' | 'warning' | 'info';
    size?: 'normal' | 'large';
}

export function StatCard({
    label,
    value,
    subValue,
    icon,
    variant = 'default',
    size = 'normal'
}: StatCardProps) {
    return (
        <div className={`stat-card stat-card--${variant} stat-card--${size}`}>
            <div className="stat-card__label">
                {icon && <span className="stat-card__icon">{icon}</span>}
                {label}
            </div>
            <div className="stat-card__value">{value}</div>
            {subValue && <div className="stat-card__sub">{subValue}</div>}
        </div>
    );
}
