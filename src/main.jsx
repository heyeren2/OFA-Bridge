import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { WagmiProvider, RainbowKitProvider, queryClient, config } from './config/wagmiConfig'
import { QueryClientProvider } from '@tanstack/react-query'
import { ApolloProvider } from '@apollo/client'
import { client } from './services/graphql'
import { ThemeProvider } from './components/Theme'
import App from './App.jsx'
import './App.css'

createRoot(document.getElementById('root')).render(
    <StrictMode>
        <WagmiProvider config={config}>
            <QueryClientProvider client={queryClient}>
                <ApolloProvider client={client}>
                    <RainbowKitProvider>
                        <ThemeProvider>
                            <App />
                        </ThemeProvider>
                    </RainbowKitProvider>
                </ApolloProvider>
            </QueryClientProvider>
        </WagmiProvider>
    </StrictMode>,
)

