import React from 'react';
import { DollarSign, Activity as ActivityIcon } from 'lucide-react';

export const VolumeCard = ({ volume, txCount, filter, setFilter }) => {
    const filters = [
        { id: '24h', label: '24H' },
        { id: '7d', label: '7D' },
        { id: '30d', label: '30D' },
        { id: 'all', label: 'ALL' },
    ];

    return (
        <div className="volume-card-container">
            <div className="volume-card-header">
                <h3>Global Activity</h3>
                <div className="volume-filters">
                    {filters.map(f => (
                        <button
                            key={f.id}
                            className={`filter-btn ${filter === f.id ? 'active' : ''}`}
                            onClick={() => setFilter(f.id)}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="volume-stats-grid">
                <div className="stat-item">
                    <div className="stat-icon-wrapper volume">
                        <DollarSign size={20} />
                    </div>
                    <div className="stat-content">
                        <span className="stat-label">Total Volume</span>
                        <span className="stat-value">
                            ${parseFloat(volume).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                    </div>
                </div>

                <div className="stat-item">
                    <div className="stat-icon-wrapper count">
                        <ActivityIcon size={20} />
                    </div>
                    <div className="stat-content">
                        <span className="stat-label">Total Transactions</span>
                        <span className="stat-value">{parseInt(txCount).toLocaleString()}</span>
                    </div>
                </div>
            </div>
        </div>
    );
};
