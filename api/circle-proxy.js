/**
 * Vercel Serverless Proxy for Circle API
 * Routes: /api/circle-proxy/* → https://api.circle.com/*
 *
 * This solves the CORS issue on production. Circle's API blocks direct
 * browser requests from ofabridge.xyz, but server-to-server calls are fine.
 */

export default async function handler(req, res) {
    // Build the target Circle API URL from the incoming path
    // e.g. /api/circle-proxy/v1/stablecoinKits/swap → https://api.circle.com/v1/stablecoinKits/swap
    const targetPath = req.url.replace('/api/circle-proxy', '');
    const targetUrl = `https://api.circle.com${targetPath}`;

    try {
        const response = await fetch(targetUrl, {
            method: req.method,
            headers: {
                'Content-Type': 'application/json',
                // Forward the Authorization header if present (for Kit Key auth)
                ...(req.headers.authorization && { Authorization: req.headers.authorization }),
                // Forward any other Circle-specific headers
                ...(req.headers['x-circle-kit-key'] && { 'x-circle-kit-key': req.headers['x-circle-kit-key'] }),
            },
            // Forward the request body for POST requests
            ...(req.method !== 'GET' && req.method !== 'HEAD' && {
                body: JSON.stringify(req.body),
            }),
        });

        const data = await response.json();

        // Forward Circle's response status and body back to the browser
        res.status(response.status).json(data);

    } catch (error) {
        console.error('[CircleProxy] Error:', error);
        res.status(502).json({ error: 'Bad Gateway', message: error.message });
    }
}
