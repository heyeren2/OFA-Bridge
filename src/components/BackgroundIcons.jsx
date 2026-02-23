import React from 'react';
import './BackgroundIcons.css';

const BackgroundIcons = () => {
    return (
        <div className="background-icons-container">
            <div className="floating-icon icon-usdc">
                <img src="/icons/usdc.png" alt="" />
            </div>
            <div className="floating-icon icon-eth">
                <img src="/icons/ethereum.png" alt="" />
            </div>
            <div className="floating-icon icon-base">
                <img src="/icons/Base.png" alt="" />
            </div>
            <div className="floating-icon icon-sei">
                <img src="/icons/sei.png" alt="" />
            </div>
            <div className="floating-icon icon-ink">
                <img src="/icons/ink.png" alt="" />
            </div>
        </div>
    );
};

export default BackgroundIcons;
