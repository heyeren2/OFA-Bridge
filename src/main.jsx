import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { WagmiProvider, RainbowKitProvider, queryClient, config } from './config/wagmiConfig'
import { QueryClientProvider } from '@tanstack/react-query'
import { ApolloProvider } from '@apollo/client'
import { ThemeProvider } from './components/Theme'
import App from './App.jsx'
import './App.css'

createRoot(document.getElementById('root')).render(
    <StrictMode>
        <WagmiProvider config={config}>
            <QueryClientProvider client={queryClient}>
                <RainbowKitProvider>
                    <ThemeProvider>
                        <App />
                    </ThemeProvider>
                </RainbowKitProvider>
            </QueryClientProvider>
        </WagmiProvider>
    </StrictMode>,
)


