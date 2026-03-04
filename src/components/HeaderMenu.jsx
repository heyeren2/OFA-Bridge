import React, { useState } from 'react';
import { useTheme } from './Theme';

const TRANSLATIONS = {
    English: {
        learn: 'Learn',
        support: 'Support',
        theme: 'Theme',
        resources: 'Resources',
        documentation: "Build Doc's",
        about: 'About OFA Bridge',
        terms: 'Terms & Privacy',
        light: 'Light',
        dark: 'Dark',
        circle: 'Circle docs',
        arc: 'Arc docs'
    },
    Español: {
        learn: 'Aprender',
        support: 'Soporte',
        theme: 'Tema',
        resources: 'Recursos',
        documentation: 'Documentación',
        about: 'Sobre OFA Bridge',
        terms: 'Términos y Privacidad',
        light: 'Claro',
        dark: 'Oscuro',
        circle: 'Documentos de Circle',
        arc: 'Documentos de Arc'
    },
    Dutch: {
        learn: 'Leren',
        support: 'Ondersteuning',
        theme: 'Thema',
        resources: 'Hulpmiddelen',
        documentation: 'Documentatie',
        about: 'Over OFA Bridge',
        terms: 'Voorwaarden & Privacy',
        light: 'Licht',
        dark: 'Donker',
        circle: 'Circle docs',
        arc: 'Arc docs'
    },
    French: {
        learn: 'Apprendre',
        support: 'Support',
        theme: 'Thème',
        resources: 'Ressources',
        documentation: 'Documentation',
        about: 'À propos de OFA Bridge',
        terms: 'Conditions et confidentialité',
        light: 'Clair',
        dark: 'Sombre',
        circle: 'Docs Circle',
        arc: 'Docs Arc'
    },
    Chinese: {
        learn: '学习',
        support: '支持',
        theme: '主题',
        resources: '资源',
        documentation: '文档',
        about: '关于 OFA Bridge',
        terms: '条款与隐私',
        light: '亮色',
        dark: '暗色',
        circle: 'Circle 文档',
        arc: 'Arc 文档'
    },
    Japanese: {
        learn: '学ぶ',
        support: 'サポート',
        theme: 'テーマ',
        resources: 'リソース',
        documentation: 'ドキュメント',
        about: 'OFA Bridge について',
        terms: '利用規約とプライバシー',
        light: 'ライト',
        dark: 'ダーク',
        circle: 'Circle ドキュメント',
        arc: 'Arc ドキュメント'
    }
};

export default function HeaderMenu({ isOpen, onClose, onOpenLearn, onOpenAbout, language }) {
    const { theme, setTheme: onThemeChange } = useTheme();
    const [activeView, setActiveView] = useState('main');
    const t = TRANSLATIONS[language] || TRANSLATIONS.English;

    if (!isOpen) return null;

    const renderMain = () => (
        <>
            <div className="menu-section">
                <a
                    href="#"
                    className="menu-item section-only"
                    onClick={(e) => {
                        e.preventDefault();
                        onOpenLearn();
                    }}
                >
                    {t.learn}
                </a>
            </div>

            <div className="menu-section">
                <a href="#" className="menu-item section-only">{t.support}</a>
            </div>

            <div className="menu-section">
                <button
                    className="menu-item section-only sub-trigger"
                    onClick={() => setActiveView('theme')}
                >
                    {t.theme}
                    <span className="sub-arrow">›</span>
                </button>
            </div>

            <div className="menu-section">
                <h3 className="menu-section-title">{t.resources}</h3>
                <button
                    className="menu-item sub-trigger"
                    onClick={() => setActiveView('docs')}
                >
                    {t.documentation}
                    <span className="sub-arrow">›</span>
                </button>
            </div>

            <div className="menu-divider"></div>

            <div className="menu-section about-section" style={{ marginBottom: '4px', marginTop: '0px' }}>
                <div
                    className="menu-item"
                    style={{ gap: '6px', padding: '4px 0', justifyContent: 'flex-start', cursor: 'default' }}
                >
                    <span className="platform-icon" style={{ width: '24px', height: '24px', background: 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <img src="/icons/Ofa2.png" alt="OFA" style={{ width: '63px', height: '63px' }} />
                    </span>
                    <span style={{ fontSize: '14px', fontWeight: '600', whiteSpace: 'nowrap' }}>{t.about}</span>
                </div>
            </div>

            <div className="menu-footer">
                <div className="social-links">
                    <a href="https://x.com/heyeren_" target="_blank" rel="noopener noreferrer" className="social-link">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                        </svg>
                    </a>
                    <a href="https://github.com/heyeren2" target="_blank" rel="noopener noreferrer" className="social-link">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2C6.477 2 2 6.477 2 12c0 4.419 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482C19.138 20.161 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
                        </svg>
                    </a>
                    <span className="social-link" style={{ cursor: 'default', opacity: 0.5 }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.666 4.37a.08.08 0 00-.033.025C1.066 8.233.35 12.003.692 15.71a.081.081 0 00.033.056 19.863 19.863 0 006.026 3.05.077.077 0 00.084-.027c.461-.63.862-1.317 1.2-2.033a.076.076 0 00-.041-.105 13.105 13.105 0 01-1.872-.892.077.077 0 01-.008-.128c.126-.094.252-.191.372-.292a.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.101.246.198.372.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.34.714.743 1.4 1.2 2.03a.078.078 0 00.084.028 19.837 19.837 0 006.03-3.049.077.077 0 00.032-.054c.4-4.257-.66-8.012-2.992-11.314a.076.076 0 00-.033-.026zm-11.45 10.38c-1.182 0-2.153-1.085-2.153-2.419 0-1.333.955-2.419 2.153-2.419 1.21 0 2.176 1.096 2.153 2.42 0 1.333-.956 2.419-2.153 2.419zm7.046 0c-1.182 0-2.153-1.085-2.153-2.419 0-1.333.954-2.419 2.153-2.419 1.21 0 2.176 1.096 2.154 2.42 0 1.333-.941 2.419-2.154 2.419z" />
                        </svg>
                    </span>
                </div>
                <a href="#" className="menu-footer-link">{t.terms}</a>
            </div>
        </>
    );

    const renderTheme = () => (
        <div className="sub-menu">
            <div className="sub-menu-header">
                <button className="back-btn" onClick={() => setActiveView('main')}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="19" y1="12" x2="5" y2="12"></line>
                        <polyline points="12 19 5 12 12 5"></polyline>
                    </svg>
                </button>
                <h3 className="sub-menu-title">{t.theme}</h3>
            </div>
            <div className="sub-menu-content">
                <button
                    className={`menu-item sub-item ${theme === 'light' ? 'active' : ''}`}
                    onClick={() => onThemeChange('light')}
                >
                    <span className="item-icon">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="5"></circle>
                            <line x1="12" y1="1" x2="12" y2="3"></line>
                            <line x1="12" y1="21" x2="12" y2="23"></line>
                            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                            <line x1="1" y1="12" x2="3" y2="12"></line>
                            <line x1="21" y1="12" x2="23" y2="12"></line>
                            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
                        </svg>
                    </span>
                    {t.light}
                    {theme === 'light' && <span className="check-icon">✓</span>}
                </button>
                <button
                    className={`menu-item sub-item ${theme === 'dark' ? 'active' : ''}`}
                    onClick={() => onThemeChange('dark')}
                >
                    <span className="item-icon">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                        </svg>
                    </span>
                    {t.dark}
                    {theme === 'dark' && <span className="check-icon">✓</span>}
                </button>
            </div>
        </div>
    );

    const renderDocs = () => (
        <div className="sub-menu">
            <div className="sub-menu-header">
                <button className="back-btn" onClick={() => setActiveView('main')}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="19" y1="12" x2="5" y2="12"></line>
                        <polyline points="12 19 5 12 12 5"></polyline>
                    </svg>
                </button>
                <h3 className="sub-menu-title">{t.documentation}</h3>
            </div>
            <div className="sub-menu-content">
                <a href="https://developers.circle.com/" target="_blank" rel="noopener noreferrer" className="menu-item sub-item">
                    <span className="item-icon">
                        <img src="/icons/circle.png" alt="Circle" style={{ width: '20px', height: '20px', borderRadius: '50%' }} />
                    </span>
                    {t.circle}
                </a>
                <a href="https://docs.arc.network/arc/concepts/welcome-to-arc" target="_blank" rel="noopener noreferrer" className="menu-item sub-item">
                    <span className="item-icon">
                        <img src="/icons/Arc.png" alt="Arc" style={{ width: '20px', height: '20px', borderRadius: '50%' }} />
                    </span>
                    {t.arc}
                </a>
            </div>
        </div>
    );

    return (
        <div className="header-menu-dropdown">
            <div className="menu-inner" style={{ padding: '8px 12px' }}>
                {activeView === 'main' && renderMain()}
                {activeView === 'theme' && renderTheme()}
                {activeView === 'docs' && renderDocs()}
            </div>
        </div>
    );
}
