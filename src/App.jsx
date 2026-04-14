import { useState, useEffect } from 'react';
import { Wallet } from 'lucide-react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import Bridge from './components/Bridge';
import Activity from './components/Activity';
import OfaSwap from './components/OfaSwap';
import HeaderMenu from './components/HeaderMenu';
import LearnPopup from './components/LearnPopup';
import SettingsPopup from './components/SettingsPopup';
// import AboutModal from './components/AboutModal'; // Temporarily disabled for push
import BackgroundIcons from './components/BackgroundIcons';
import RecipientModal from './components/RecipientModal';
import './components/RecipientModal.css';
import './App.css';

function App() {
    const [activeTab, setActiveTab] = useState(() => localStorage.getItem('activeTab') || 'bridge');
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isLearnOpen, setIsLearnOpen] = useState(false);
    const [isAboutOpen, setIsAboutOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [currency, setCurrency] = useState('USD');
    const [language, setLanguage] = useState('English');
    const [slippage, setSlippage] = useState('1.0');
    const [customRecipient, setCustomRecipient] = useState('');
    const [isRecipientModalOpen, setIsRecipientModalOpen] = useState(false);

    useEffect(() => {
        localStorage.setItem('activeTab', activeTab);
    }, [activeTab]);

    const toggleMenu = () => setIsMenuOpen(!isMenuOpen);
    const toggleLearn = () => {
        setIsLearnOpen(!isLearnOpen);
        setIsMenuOpen(false);
    };
    const toggleAbout = () => {
        setIsAboutOpen(!isAboutOpen);
        setIsMenuOpen(false);
    };

    return (
        <div className={`app ${isMenuOpen ? 'menu-open' : ''} ${activeTab}-active`}>
            <BackgroundIcons />
            {isMenuOpen && (
                <div className="menu-backdrop" onClick={() => setIsMenuOpen(false)}></div>
            )}
            <header className={`app-header ${isMenuOpen ? 'header-menu-active' : ''}`}>
                <div className="header-left">
                    <div className="logo">
                        <img src="/icons/Ofa2.png" className="logo-icon" alt="OFA Logo" />
                        <h1>OFA Bridge</h1>
                    </div>
                    <nav className="header-nav">
                        <button
                            className={`nav-btn ${activeTab === 'bridge' ? 'active' : ''}`}
                            onClick={() => setActiveTab('bridge')}
                        >
                            Bridge
                        </button>
                        <button
                            className={`nav-btn ${activeTab === 'swap' ? 'active' : ''}`}
                            onClick={() => setActiveTab('swap')}
                        >
                            Swap
                        </button>
                        <button
                            className={`nav-btn ${activeTab === 'activity' ? 'active' : ''}`}
                            onClick={() => setActiveTab('activity')}
                        >
                            Activity
                        </button>
                    </nav>
                </div>
                <div className="wallet-controls">
                    <ConnectButton.Custom>
                        {({
                            account,
                            chain,
                            openAccountModal,
                            openChainModal,
                            openConnectModal,
                            authenticationStatus,
                            mounted,
                        }) => {
                            const ready = mounted && authenticationStatus !== 'loading';
                            const connected =
                                ready &&
                                account &&
                                chain &&
                                (!authenticationStatus ||
                                    authenticationStatus === 'authenticated');

                            return (
                                <div
                                    {...(!ready && {
                                        'aria-hidden': true,
                                        'style': {
                                            opacity: 0,
                                            pointerEvents: 'none',
                                            userSelect: 'none',
                                        },
                                    })}
                                >
                                    {(() => {
                                        if (!connected) {
                                            return (
                                                <button onClick={openConnectModal} type="button" className="custom-connect-btn">
                                                    Connect <span className="mobile-hide">Wallet</span>
                                                </button>
                                            );
                                        }

                                        if (chain.unsupported) {
                                            return (
                                                <button onClick={openChainModal} type="button" className="custom-connect-btn unsupported">
                                                    Wrong network
                                                </button>
                                            );
                                        }

                                        return (
                                            <div style={{ display: 'flex', gap: 12 }}>
                                                <button
                                                    onClick={openChainModal}
                                                    style={{ display: 'flex', alignItems: 'center' }}
                                                    type="button"
                                                    className="custom-connect-btn chain-btn"
                                                >
                                                    {chain.hasIcon && (
                                                        <div
                                                            className="chain-icon-mobile-wrap"
                                                            style={{
                                                                background: chain.iconBackground,
                                                                width: 20,
                                                                height: 20,
                                                                borderRadius: 999,
                                                                overflow: 'hidden',
                                                                marginRight: ready && connected ? 0 : 8,
                                                            }}
                                                        >
                                                            {chain.iconUrl && (
                                                                <img
                                                                    alt={chain.name ?? 'Chain icon'}
                                                                    src={chain.iconUrl}
                                                                    style={{ width: 20, height: 20 }}
                                                                />
                                                            )}
                                                        </div>
                                                    )}
                                                    <span className="mobile-hide">{chain.name}</span>
                                                </button>

                                                <button onClick={openAccountModal} type="button" className="custom-connect-btn">
                                                    <Wallet size={18} className="mobile-only-icon" style={{ display: 'none' }} />
                                                    <span className="mobile-hide">
                                                        {account.displayName}
                                                        {account.displayBalance
                                                            ? ` (${account.displayBalance})`
                                                            : ''}
                                                    </span>
                                                </button>
                                            </div>
                                        );
                                    })()}
                                </div>
                            );
                        }}
                    </ConnectButton.Custom>
                    <div className="menu-container">
                        <button className="header-menu-btn" onClick={toggleMenu}>
                            <div className="menu-lines">
                                <span></span>
                                <span></span>
                            </div>
                        </button>
                        <HeaderMenu
                            isOpen={isMenuOpen}
                            onClose={() => setIsMenuOpen(false)}
                            onOpenLearn={toggleLearn}
                            onOpenAbout={toggleAbout}
                            language={language}
                        />
                    </div>
                </div>
            </header>
            <LearnPopup isOpen={isLearnOpen} onClose={() => setIsLearnOpen(false)} />
            {/* <AboutModal isOpen={isAboutOpen} onClose={() => setIsAboutOpen(false)} /> */}
            <main className="app-main">
                {activeTab === 'bridge' ? (
                    <div className="bridge-page-wrapper">
                        <div className="bridge-view-wrap">
                            <Bridge
                                currency={currency}
                                language={language}
                                slippage={slippage}
                                onOpenSettings={() => setIsSettingsOpen(true)}
                                isSettingsOpen={isSettingsOpen}
                                setIsSettingsOpen={setIsSettingsOpen}
                                setCurrency={setCurrency}
                                setLanguage={setLanguage}
                                setActiveTab={setActiveTab}
                                customRecipient={customRecipient}
                                setCustomRecipient={setCustomRecipient}
                                onOpenRecipientModal={() => setIsRecipientModalOpen(true)}
                            />
                        </div>
                    </div>
                ) : activeTab === 'swap' ? (
                    <OfaSwap />
                ) : (
                    <Activity language={language} setActiveTab={setActiveTab} />
                )}
            </main>
            <SettingsPopup
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
                currency={currency}
                setCurrency={setCurrency}
                language={language}
                setLanguage={setLanguage}
                slippage={slippage}
                setSlippage={setSlippage}
            />
            <RecipientModal
                isOpen={isRecipientModalOpen}
                onClose={() => setIsRecipientModalOpen(false)}
                onConfirm={(addr) => setCustomRecipient(addr)}
                initialValue={customRecipient}
            />
            <footer className="app-footer">
                <p>Powered by Circle CCTP V2 • Cross-Chain Bridge</p>
            </footer>
        </div>
    );
}

export default App;

