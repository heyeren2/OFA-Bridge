export default function BridgeStatus({ currentStep, steps, error }) {
    const defaultSteps = [
        { key: 'swap', label: 'Swap ETH → USDC' },
        { key: 'approve', label: 'Approve USDC' },
        { key: 'burn', label: 'Burn on Source' },
        { key: 'attestation', label: 'Attestation' },
        { key: 'mint', label: 'Mint on Arc' },
    ];

    const displaySteps = steps || defaultSteps;

    const getStepStatus = (stepKey) => {
        if (error) {
            const stepIndex = displaySteps.findIndex((s) => s.key === stepKey);
            const currentIndex = displaySteps.findIndex((s) => s.key === currentStep);
            if (stepIndex === currentIndex) return 'error';
            if (stepIndex < currentIndex) return 'completed';
            return 'pending';
        }

        if (currentStep === 'complete') return 'completed';

        const stepIndex = displaySteps.findIndex((s) => s.key === stepKey);
        const currentIndex = displaySteps.findIndex((s) => s.key === currentStep);

        if (stepIndex < currentIndex) return 'completed';
        if (stepIndex === currentIndex) return 'active';
        return 'pending';
    };

    return (
        <div className="bridge-status">
            <h3 className="status-title">Bridge Progress</h3>
            <div className="steps-container">
                {displaySteps.map((step, index) => {
                    const status = getStepStatus(step.key);
                    return (
                        <div key={step.key} className={`step-item ${status}`}>
                            <div className="step-indicator">
                                {status === 'completed' && <span className="step-check">✓</span>}
                                {status === 'active' && <span className="step-spinner"></span>}
                                {status === 'error' && <span className="step-error">✕</span>}
                                {status === 'pending' && <span className="step-number">{index + 1}</span>}
                            </div>
                            <div className="step-info">
                                <span className="step-label">{step.label}</span>
                            </div>
                            {index < displaySteps.length - 1 && (
                                <div className={`step-connector ${status === 'completed' ? 'filled' : ''}`} />
                            )}
                        </div>
                    );
                })}
            </div>
            {error && (
                <div className="status-error">
                    {error}
                </div>
            )}
            {currentStep === 'complete' && (
                <div className="status-success">
                    Bridge completed successfully!
                </div>
            )}
        </div>
    );
}
